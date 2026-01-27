#!/usr/bin/env bun

import { runMigrations } from "./db";
import { registerCommand, routeCommand } from "./cli";
import { setupCommand } from "./cli/commands/setup";
import { recategorizeCommand } from "./cli/commands/recategorize";
import { syncCommand } from "./cli/commands/sync";
import { listCommand } from "./cli/commands/list";
import { summaryCommand } from "./cli/commands/summary";
import { reviewCommand } from "./cli/commands/review";
import { reparseCommand } from "./cli/commands/reparse";
import { chatCommand } from "./cli/commands/chat";
import { flagCommand } from "./cli/commands/flag";
import { remerchantCommand } from "./cli/commands/remerchant";

// Register commands
registerCommand("setup", setupCommand);
registerCommand("recategorize", recategorizeCommand);
registerCommand("sync", syncCommand);
registerCommand("list", listCommand);
registerCommand("summary", summaryCommand);
registerCommand("review", reviewCommand);
registerCommand("reparse", reparseCommand);
registerCommand("chat", chatCommand);
registerCommand("flag", flagCommand);
registerCommand("remerchant", remerchantCommand);

// Run migrations on startup
runMigrations();

// Route CLI command
const args = process.argv.slice(2);
await routeCommand(args);
