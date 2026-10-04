if (process.env.TEST_DATABASE_URL) {
  const url = new URL(process.env.TEST_DATABASE_URL);
  if (!url.pathname.endsWith("_test")) throw new Error("Tests require a dedicated database whose name ends with _test");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
process.env.APP_URL ??= "http://localhost:3000";
process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:5432/unused_test";
