import postgres from "postgres";
import { databaseTls } from "../src/lib/security";

/** Read-only deployment inspection. Prints schema/privilege metadata, never connection strings or rows. */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.log(JSON.stringify({ inspected: false, reason: "DATABASE_URL missing" })); return; }
  const sql = postgres(url, { ssl: databaseTls(url, true), prepare: false, max: 1, connect_timeout: 10,
    connection: { statement_timeout: 10_000 } });
  try {
    const report = await sql.begin(async (tx) => {
      await tx`set transaction read only`;
      const roles = await tx`select rolsuper as superuser, rolbypassrls as bypass_rls, rolcreaterole as create_roles,
        rolcreatedb as create_databases from pg_roles where rolname = current_user`;
      const tls = await tx`select ssl, version from pg_stat_ssl where pid = pg_backend_pid()`;
      const tables = await tx`select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as forced_rls,
        c.relowner = (select oid from pg_roles where rolname = current_user) as current_role_owns_table
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' order by c.relname`;
      const policies = await tx`select tablename, policyname, roles, cmd from pg_policies where schemaname = 'public'`;
      const grants = await tx`select table_name, grantee, privilege_type from information_schema.table_privileges
        where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')`;
      const functions = await tx`select p.proname as name, p.prosecdef as security_definer, p.proconfig as settings
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
        and p.proname in ('create_trial', 'consume_rate_limit')`;
      return { inspected: true, roles, tls, tables, policies, publicGrants: grants, functions };
    });
    console.log(JSON.stringify(report, null, 2));
  } catch { console.log(JSON.stringify({ inspected: false, reason: "Connection or read-only metadata inspection failed; verify credentials, network and trusted CA configuration" })); process.exitCode = 1; }
  finally { await sql.end({ timeout: 2 }); }
}
void main();
