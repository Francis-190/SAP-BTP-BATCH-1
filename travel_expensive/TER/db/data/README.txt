TER – Updated multi-role CSV seed data

This archive is based on the supplied TER CSV dataset and the previously prepared Kavya dataset.
It includes role-oriented sample transactions for:
- Kavya U K (EMP1009): employee claims, including a claim awaiting manager approval and one in FinanceReview.
- Rapeti Gowripriya (EMP1010): Engineering Manager; Kavya reports to her. She has a completed personal trip/claim and a direct-report claim awaiting manager action.
- Shivani Dubey (EMP1011): Finance Reviewer; finance approval decisions and FinanceReview queue examples are attributed to her.
- Varun Patel (EMP1012): Finance Administrator; ERP export/payment processing is represented in the reimbursement and status-history data.

The archive retains the original employees, categories, currencies, policy limits, exchange rates, and original transactions.
No CDS schema, service code, or authorization rules are changed.

Install: back up db/data, extract all CSV files into TER/db/data, replacing files with the same names, then restart `npx cds watch`.
These are development/demo seed records, not production financial records.
