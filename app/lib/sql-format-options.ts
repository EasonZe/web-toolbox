export const sqlDialects = [
  ["sql", "标准 SQL"], ["mysql", "MySQL"], ["postgresql", "PostgreSQL"],
  ["sqlite", "SQLite"], ["transactsql", "SQL Server"], ["mariadb", "MariaDB"],
  ["plsql", "Oracle PL/SQL"], ["bigquery", "BigQuery"], ["duckdb", "DuckDB"],
  ["clickhouse", "ClickHouse"], ["snowflake", "Snowflake"], ["spark", "Spark SQL"],
  ["hive", "Hive"], ["trino", "Trino / Presto"], ["redshift", "Redshift"],
  ["db2", "DB2"], ["db2i", "DB2 for i"], ["tidb", "TiDB"],
  ["singlestoredb", "SingleStoreDB"], ["n1ql", "Couchbase N1QL"],
] as const;
export type SqlFormatOptions = {
  dialect: (typeof sqlDialects)[number][0];
  indent: 2 | 4;
  keywordCase: "preserve" | "upper" | "lower";
};
export type SqlFormatResult = { output: string; changed: boolean };
