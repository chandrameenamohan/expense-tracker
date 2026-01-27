export type CommandHandler = (args: string[]) => void | Promise<void>;

const commands = new Map<string, CommandHandler>();

export function registerCommand(name: string, handler: CommandHandler): void {
  commands.set(name, handler);
}

export async function routeCommand(argv: string[]): Promise<void> {
  const command = argv[0];
  const args = argv.slice(1);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const handler = commands.get(command);
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error('Run "expense-tracker help" for available commands.');
    process.exitCode = 1;
    return;
  }

  await handler(args);
}

function printHelp(): void {
  console.log(`expense-tracker — AI-powered personal expense tracker

Usage: expense-tracker <command> [options]

Commands:
  setup          Configure Gmail OAuth credentials
  sync           Fetch and parse new transaction emails
  list           List transactions (with filters)
  summary        Expense summary and category breakdown
  review         Review low-confidence AI-parsed transactions
  recategorize   Override a transaction's category
  reparse        Re-parse all raw emails
  chat           Conversational query mode
  help           Show this help message`);
}
