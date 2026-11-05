// Creates the owner account.
//   dev:   npm run owner:create -- --name "Jane Doe" --email jane@shop.lk --username jane [--shop "My Shop"]
//   prod:  npm run build && node dist/cli/create-owner.js --name ... (same flags)
// The password is read from the OWNER_PASSWORD environment variable, or typed at a hidden prompt
// (never passed as a flag, so it does not end up in shell history or the process list).
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { prisma } from "../config/database.js";
import { createOwner } from "../db/create-owner.js";

export function parseOwnerArgs(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      name: { type: "string" },
      email: { type: "string" },
      username: { type: "string" },
      shop: { type: "string" },
    },
    strict: true,
  });
  return {
    name: values.name,
    email: values.email,
    username: values.username,
    shopName: values.shop,
  };
}

/** Reads a line without echoing it. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyRl = rl as any;
    anyRl._writeToOutput = (s: string) => {
      if (s.includes(question)) process.stdout.write(s);
    };
    rl.question(question, (answer) => {
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

async function readPassword(): Promise<string> {
  if (process.env.OWNER_PASSWORD) return process.env.OWNER_PASSWORD;
  if (!process.stdin.isTTY)
    throw new Error("Set OWNER_PASSWORD, or run this in a terminal to be prompted.");
  const a = await promptHidden("Password (min 8 characters): ");
  const b = await promptHidden("Repeat password: ");
  if (a !== b) throw new Error("The passwords do not match.");
  return a;
}

async function main() {
  const args = parseOwnerArgs(process.argv.slice(2));
  const password = await readPassword();
  const owner = await createOwner({ ...args, password } as Parameters<typeof createOwner>[0]);
  console.log(`Owner created: ${owner.name} <${owner.email}> (username: ${owner.username})`);
}

// Run only when executed directly, not when imported by tests.
if (process.argv[1] && /create-owner\.(ts|js)$/.test(process.argv[1])) {
  main()
    .catch((e: unknown) => {
      const message =
        e && typeof e === "object" && "issues" in e
          ? (e as { issues: { message: string }[] }).issues.map((i) => i.message).join("\n")
          : e instanceof Error
            ? e.message
            : String(e);
      console.error(`Could not create the owner:\n${message}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
