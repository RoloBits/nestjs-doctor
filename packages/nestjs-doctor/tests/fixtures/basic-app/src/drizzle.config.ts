export default {
	schema: "./src/**/*.schema.ts",
	out: "./drizzle",
	dbCredentials: {
		connectionString: process.env.DATABASE_URL!,
	},
};
