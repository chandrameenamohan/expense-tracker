# Spec 03: Transaction Parser

## Overview

Parse transaction details from raw email content. Each bank/service has a different email format requiring specific parsing logic.

## Parser Interface

```typescript
interface Transaction {
  id: string;              // Generated unique ID
  emailMessageId: string;  // Gmail message ID (for dedup)
  date: Date;
  amount: number;          // Always positive
  direction: "debit" | "credit";
  type: "upi" | "credit_card" | "bank_transfer" | "sip" | "loan";
  merchant: string;        // Payee/payer name
  account: string;         // Account identifier (masked card/account number)
  bank: string;            // Bank name
  reference?: string;      // UPI ref / transaction ID
  description?: string;    // Raw transaction description
  category?: string;       // Assigned later by categorizer
}

interface Parser {
  canParse(email: RawEmail): boolean;
  parse(email: RawEmail): Transaction | null;
}
```

## Parser Types

### UPI Parser
- Detects UPI transaction emails (Google Pay, PhonePe, bank UPI alerts)
- Extracts: amount, merchant/VPA, UPI reference number, date
- Handles both debit and credit

### Credit Card Parser
- Detects credit card transaction alerts
- Extracts: amount, merchant, card number (masked), date
- Handles domestic and international transactions

### Bank Transfer Parser
- Detects NEFT/RTGS/IMPS/debit notifications
- Extracts: amount, account number, beneficiary, reference
- Handles salary credits, transfers

### SIP Parser
- Detects SIP/mutual fund debit confirmations
- Extracts: amount, fund name, folio number, date

### Loan Parser
- Detects EMI debit notifications
- Extracts: amount, loan account, EMI number, date

## Parsing Strategy

1. Identify sender (from address) to select parser
2. Extract text content from email body
3. Use regex patterns to extract transaction fields
4. Normalize amounts (handle commas, currency symbols)
5. Return structured `Transaction` or `null` if unparseable

## Acceptance Criteria

- [ ] Each parser correctly identifies its email type
- [ ] Parses amount, date, merchant from at least 2 bank formats per type
- [ ] Handles both HTML and plain text email bodies
- [ ] Returns null for unrecognized formats (no crashes)
- [ ] Amount normalization handles "Rs.", "INR", commas, decimals
