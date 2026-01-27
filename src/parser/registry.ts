import type { Parser, RawEmail, Transaction } from "../types";

/**
 * Manages an ordered list of parsers and runs the parsing pipeline.
 * Regex parsers are tried in order; if none succeed, a fallback parser
 * (e.g. AI) can be provided separately.
 */
export class ParserRegistry {
  private parsers: Parser[] = [];
  private fallback: Parser | null = null;

  register(parser: Parser): void {
    this.parsers.push(parser);
  }

  setFallback(parser: Parser): void {
    this.fallback = parser;
  }

  parse(email: RawEmail): Transaction[] {
    // Try regex parsers in order
    for (const parser of this.parsers) {
      if (parser.canParse(email)) {
        const result = parser.parse(email);
        if (result && result.length > 0) {
          return result;
        }
        // canParse was true but parse returned null/empty — fall through
      }
    }

    // AI fallback
    if (this.fallback) {
      if (this.fallback.canParse(email)) {
        const result = this.fallback.parse(email);
        if (result && result.length > 0) {
          return result;
        }
      }
    }

    // Unparseable
    return [];
  }
}
