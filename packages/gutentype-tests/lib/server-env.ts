/*
 * Imported first by the server lane's tests, before Keybr's server modules evaluate. Gutentype runs sqlite in
 * production, so its server tests run on an in-memory sqlite database unless GUTENTYPE_TEST_DATABASE names
 * another client. The canonical URL is the Gutentype domain, so a test email's link reads like a real one.
 */
process.env.DATABASE_CLIENT = process.env.GUTENTYPE_TEST_DATABASE ?? "sqlite";
process.env.DATABASE_FILENAME = ":memory:";
process.env.APP_URL = "https://gutentype.app/";

export {};
