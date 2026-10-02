import pg from 'pg';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();
const ref = 'qnorggoycwbbxdlvbcvq';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD.trim());
const c = new pg.Client({
  connectionString: `postgresql://postgres.${ref}:${pw}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const { rows: users } = await c.query(
  `SELECT id, email FROM auth.users WHERE email ILIKE '%bunmi.akinyemiju%'`,
);

for (const u of users) {
  await c.query(
    `DELETE FROM employee_access a
     USING employees e
     WHERE a.profile_id = $1 AND a.employee_id = e.id
       AND e.name NOT ILIKE 'Bunmi Akinyemiju%'`,
    [u.id],
  );
}

// VigiPay: only link if a Bunmi Akinyemiju roster row exists (not other Bunmis).
const primary = users.find((u) => u.email === 'bunmi.akinyemiju@peopleos.co')?.id;
if (primary) {
  const { rows: vigipay } = await c.query(
    `SELECT id FROM employees
     WHERE subsidiary_id = vigipay_subsidiary_id()
       AND name ILIKE 'Bunmi Akinyemiju%' LIMIT 1`,
  );
  if (vigipay[0]) {
    await c.query(
      `INSERT INTO employee_access (profile_id, employee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [primary, vigipay[0].id],
    );
  }
}

for (const u of users) {
  const { rows } = await c.query(
    `SELECT s.name AS company, e.name, e.email
     FROM employee_access a JOIN employees e ON e.id = a.employee_id
     JOIN subsidiaries s ON s.id = e.subsidiary_id
     WHERE a.profile_id = $1 ORDER BY s.name`,
    [u.id],
  );
  console.log(u.email);
  console.table(rows);
}

await c.end();
