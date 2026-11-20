function buildMinimalPdfString(lines: string[]): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const streamLines = ['BT', '/F1 12 Tf', '50 750 Td'];
  lines.forEach((line, idx) => {
    if (idx > 0) streamLines.push('0 -18 Td');
    streamLines.push(`(${esc(line)}) Tj`);
  });
  streamLines.push('ET');
  const stream = streamLines.join('\n');

  const encoder = new TextEncoder();
  const streamLen = encoder.encode(stream).length;

  const objs = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${streamLen} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objs) {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${obj}\n`;
  }
  const xrefPos = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return pdf;
}

function makePdfFile(fileName: string, lines: string[]): File {
  const pdf = buildMinimalPdfString(lines);
  return new File([pdf], fileName, { type: 'application/pdf' });
}

/**
 * Generates FAKE SAMPLE UK documents showing the #1 UK student visa refusal trap:
 * - Unpaid CAS tuition (GBP 20,000 - GBP 5,000 deposit = GBP 15,000) + London living costs (GBP 14,130) = INR 34,95,600
 * - Final closing balance is INR 36,00,000 (looks sufficient at a glance!)
 * - ONE day inside the 28-day window (2026-11-04) dipped to INR 28,50,000 -> RED FLAG with exact date & verbatim quote
 * - Masked PAN (ABCDE1234F -> ******234F), Aadhaar (2345 6789 0123 -> ********0123), and Passport (Z4829103 -> ****9103)
 */
export function createSampleExceptionFiles(): File[] {
  const cas = makePdfFile('SAMPLE_UK_CAS_OFFER.pdf', [
    'SAMPLE UNIVERSITY LONDON - CAS STATEMENT (FAKE DEMO DATA)',
    'Student Name: Sample Applicant',
    'Passport Number: Z4829103',
    'Course: MSc Computer Science',
    'Total First Year Tuition Fee: GBP 20000',
    'Tuition Deposit Paid: GBP 5000',
    'Currency: GBP',
    'Start Date: 2027-01-15',
  ]);

  const bank = makePdfFile('SAMPLE_INDIAN_BANK_STATEMENT.pdf', [
    'SAMPLE STATE BANK OF INDIA - 28-DAY ACCOUNT STATEMENT (FAKE DEMO DATA)',
    'Account Holder Name: Sample Applicant',
    'Account Number: 004512349876',
    'PAN: ABCDE1234F',
    'Aadhaar: 2345 6789 0123',
    'Statement Period: 2026-10-15 to 2026-11-15',
    '2026-10-15 Daily Closing Balance: INR 3600000',
    '2026-10-25 Daily Closing Balance: INR 3550000',
    '2026-11-04 Daily Closing Balance: INR 2850000',
    '2026-11-05 Daily Closing Balance: INR 3600000',
    '2026-11-15 Final Closing Balance: INR 3600000',
    'Lowest Closing Balance in 28-Day Period: INR 2850000 on 2026-11-04',
    'Currency: INR',
  ]);

  const marksheet = makePdfFile('SAMPLE_MARKSHEET_TRANSCRIPT.pdf', [
    'SAMPLE TECHNOLOGICAL UNIVERSITY - CONSOLIDATED TRANSCRIPT (FAKE DEMO DATA)',
    'Student Name: Sample Applicant',
    'Degree: B.Tech Computer Science and Engineering',
    'CGPA: 8.6 out of 10',
    'Total Backlogs: 0',
    'Graduation Date: 2025-05-20',
  ]);

  return [cas, bank, marksheet];
}

/**
 * Generates FAKE SAMPLE UK documents that pass every plain-code rule (Green Batch Ready).
 */
export function createSampleGreenFiles(): File[] {
  const cas = makePdfFile('SAMPLE_GREEN_CAS_OFFER.pdf', [
    'SAMPLE UNIVERSITY OF MANCHESTER - CAS STATEMENT (FAKE DEMO DATA)',
    'Student Name: Priya Sample',
    'Course: MSc Data Science',
    'Total First Year Tuition Fee: GBP 15000',
    'Tuition Deposit Paid: GBP 5000',
    'Currency: GBP',
    'Start Date: 2027-01-18',
  ]);

  const bank = makePdfFile('SAMPLE_GREEN_BANK_STATEMENT.pdf', [
    'SAMPLE HDFC BANK - ACCOUNT STATEMENT (FAKE DEMO DATA)',
    'Account Holder Name: Priya Sample',
    'Account Number: 009988776655',
    'Statement Period: 2026-10-12 to 2026-11-16',
    'Closing Balance: INR 3000000',
    'Currency: INR',
  ]);

  return [cas, bank];
}
