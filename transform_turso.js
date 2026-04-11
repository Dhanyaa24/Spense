const fs = require('fs');

let code = fs.readFileSync('server.js', 'utf8');

// 1. Replace imports and initialization
code = code.replace(
    "const Database = require('better-sqlite3');",
    "const { createClient } = require('@libsql/client');"
);

code = code.replace(
    "// Create/open database file — use /tmp on Vercel (serverless read-only fs)\nconst path = require('path');\nconst DB_PATH = process.env.VERCEL ? '/tmp/spense.db' : path.join(__dirname, 'spense.db');\nconst db = new Database(DB_PATH);",
    "// Turso Client Setup\nconst db = createClient({\n  url: process.env.TURSO_DATABASE_URL || 'file:spense.db',\n  authToken: process.env.TURSO_AUTH_TOKEN\n});"
);

// We need an async wrapper for the db.exec calls at the top level
const initStart = code.indexOf("// Create users table if it doesn't exist");
const initEnd = code.indexOf("console.log('✅ Database initialized');") + "console.log('✅ Database initialized');".length;

if (initStart > -1 && initEnd > -1) {
    let initBlock = code.substring(initStart, initEnd);
    
    // Convert db.exec -> await db.executeMultiple
    initBlock = initBlock.replace(/db\.exec/g, 'await db.executeMultiple');
    
    // Convert db.prepare(X).run() in the migration try/catch
    initBlock = initBlock.replace(/db\.prepare\((.*?)\)\.run\(\)/g, "await db.execute($1)");

    let asyncWrapper = `(async () => {\n${initBlock}\n})();`;
    code = code.substring(0, initStart) + asyncWrapper + code.substring(initEnd);
}

// 2. Make all app.xxx routes async
code = code.replace(/app\.(get|post|put|delete)\('([^']+)',\s*(authenticateToken,)?\s*\(req, res\) => {/g, "app.$1('$2', $3 async (req, res) => {");

// Clean up duplicate async
code = code.replace(/async async/g, 'async');

// 3. Helper to replace db.prepare calls. 
// We will simply process it line by line or with a smart regex

// Match db.prepare(SQL).get(ARGS...)
// Example: let user = db.prepare('SELECT ...').get(email)
// Becomes: let user = (await db.execute({ sql: 'SELECT ...', args: [email] })).rows[0]
code = code.replace(/db\.prepare\(([^)]+)\)\.get\(([^)]*)\)/g, (match, sql, args) => {
    sql = sql.trim();
    args = args.trim();
    if (!args) {
        return `(await db.execute(${sql})).rows[0]`;
    }
    return `(await db.execute({ sql: ${sql}, args: [${args}] })).rows[0]`;
});

// For multiline sql strings in get
// db.prepare(`...`).get(...)
code = code.replace(/db\.prepare\([\s\n]*(`[\s\S]*?`)[\s\n]*\)\.get\((.*?)\)/g, (match, sql, args) => {
    sql = sql.trim();
    args = args.trim();
    if (!args) {
        return `(await db.execute(${sql})).rows[0]`;
    }
    return `(await db.execute({ sql: ${sql}, args: [${args}] })).rows[0]`;
});

// Match db.prepare(SQL).all(ARGS...)
code = code.replace(/db\.prepare\(([^)]+)\)\.all\(([^)]*)\)/g, (match, sql, args) => {
    sql = sql.trim();
    args = args.trim();
    if (!args) {
        return `(await db.execute(${sql})).rows`;
    }
    return `(await db.execute({ sql: ${sql}, args: [${args}] })).rows`;
});

// For multiline sql strings in all
code = code.replace(/db\.prepare\([\s\n]*(`[\s\S]*?`)[\s\n]*\)\.all\((.*?)\)/g, (match, sql, args) => {
    sql = sql.trim();
    args = args.trim();
    if (!args) {
        return `(await db.execute(${sql})).rows`;
    }
    return `(await db.execute({ sql: ${sql}, args: [${args}] })).rows`;
});

// Match db.prepare(SQL).run(ARGS...)
code = code.replace(/db\.prepare\(([^)]+)\)\.run\(([^)]*)\)/g, (match, sql, args) => {
    sql = sql.trim();
    args = args.trim();
    if (!args) {
        return `await db.execute(${sql})`;
    }
    return `await db.execute({ sql: ${sql}, args: [${args}] })`;
});

// For multiline sql strings in run
code = code.replace(/db\.prepare\([\s\n]*(`[\s\S]*?`)[\s\n]*\)\.run\(([\s\S]*?)\)/g, (match, sql, args) => {
    sql = sql.trim();
    args = args.trim();
    if (!args) {
        return `await db.execute(${sql})`;
    }
    return `await db.execute({ sql: ${sql}, args: [${args}] })`;
});

// Array unpacking syntax in db.prepare(...).all(...params)
// There's a case: db.prepare(query).all(...params)
code = code.replace(/\(await db\.execute\(\{ sql: query, args: \[\.\.\.params\] \}\)\)\.rows/g, "(await db.execute({ sql: query, args: params })).rows");

// 4. Update lastInsertRowid
code = code.replace(/\.lastInsertRowid/g, ".lastInsertRowid"); // BigInt needs conversion? Usually Number(result.lastInsertRowid), but we'll add a Number() wrapper.
code = code.replace(/result\.lastInsertRowid/g, "Number(result.lastInsertRowid)");
code = code.replace(/result\.changes/g, "result.rowsAffected");

fs.writeFileSync('server.js', code);
