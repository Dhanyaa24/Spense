import re

with open('server.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. db.exec -> await db.executeMultiple
code = re.sub(r'db\.exec\(\`([\s\S]*?)\`\);', r'await db.executeMultiple(`\1`);', code)

# Wrap the top-level awaits in an async IIFE
init_pattern = r'(// Create users table if it doesn\'t exist[\s\S]*?)console\.log\(\'✅ Database initialized \[.*?\]\'\);'
code = code.replace("// Create users table if it doesn't exist", "(async () => {\n// Create users table if it doesn't exist")
code = code.replace("console.log('✅ Database initialized (users, expenses, budgets, subscriptions, reset_tokens tables)');", "console.log('✅ Database initialized');\n})();")


# 2. Fix the non-async app.get handlers
code = re.sub(r'app\.(get|post|put|delete)\(\'([^\']+)\',\s*(authenticateToken,)?\s*\(req, res\) => {', r'app.\1(\'\2\', \3 async (req, res) => {', code)
code = code.replace('async async', 'async')

# 3. db.prepare(SQL).get(ARGS...) 
def replace_get(match):
    sql = match.group(1).strip()
    args = match.group(2).strip()
    if args == '':
        return f"(await db.execute({sql})).rows[0]"
    else:
        return f"(await db.execute({{ sql: {sql}, args: [{args}] }})).rows[0]"

code = re.sub(r'db\.prepare\(([\s\S]*?)\)\.get\(([\s\S]*?)\)', replace_get, code)

# 4. db.prepare(SQL).all(ARGS...)
def replace_all(match):
    sql = match.group(1).strip()
    args = match.group(2).strip()
    if args == '':
        return f"(await db.execute({sql})).rows"
    else:
        return f"(await db.execute({{ sql: {sql}, args: [{args}] }})).rows"

code = re.sub(r'db\.prepare\(([\s\S]*?)\)\.all\(([\s\S]*?)\)', replace_all, code)

# 5. db.prepare(SQL).run(ARGS...)
def replace_run(match):
    sql = match.group(1).strip()
    args = match.group(2).strip()
    if args == '':
        return f"await db.execute({sql})"
    else:
        return f"await db.execute({{ sql: {sql}, args: [{args}] }})"

code = re.sub(r'db\.prepare\(([\s\S]*?)\)\.run\(([\s\S]*?)\)', replace_run, code)

# Remove .lastInsertRowid and convert to Number
code = re.sub(r'([a-zA-Z0-9_]+)\.lastInsertRowid', r'Number(\1.lastInsertRowid)', code)
# Fix result.changes -> result.rowsAffected
code = re.sub(r'([a-zA-Z0-9_]+)\.changes', r'\1.rowsAffected', code)

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(code)
