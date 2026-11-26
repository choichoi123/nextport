import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sources = [
  'db/playground-baseball.sql',
  'db/migrations/20261124-baseball-at-bat-sessions.sql',
  'db/migrations/20261124-baseball-career.sql',
  'db/migrations/20261125-baseball-career-v2.sql',
  'db/migrations/20261125-baseball-career-recovery.sql',
]
const migrations = [
  'db/production/001-baseball-production.sql',
  'db/production/002-baseball-at-bat-sessions.sql',
  'db/production/003-baseball-career.sql',
  'db/production/004-baseball-career-v2.sql',
  'db/production/005-baseball-career-recovery.sql',
]
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8')
const compact = value => value.replace(/\s+/g, ' ').trim()
const signature = value => compact(value).replace(/\s*([(),])\s*/g, '$1')
const clean = value => value.replace(/--[^\n]*(?:\n|$)/g, '\n')
const [originals, production, bootstrap] = await Promise.all([
  Promise.all(sources.map(read)),
  Promise.all(migrations.map(read)),
  read('db/production/000-baseball-production-bootstrap.sql'),
])
const all = [bootstrap, ...production].join('\n')

function functions(sql) {
  return [...sql.matchAll(/CREATE OR REPLACE FUNCTION\s+(baseball_private\.\w+)\s*\(([\s\S]*?)\)\s*([\s\S]*?)\bAS\s+(\$[\w]*\$)([\s\S]*?)\4\s*;/gi)].map(match => ({
    name: match[1],
    arguments: compact(match[2]),
    header: compact(match[3]),
    contract: compact(match[3]).replace(/\s+SET search_path\s*=.*$/i, ''),
    // Preserve statements, literals and comments inside function bodies exactly.
    body: match[5].replace(/\r\n/g, '\n').trim(),
  }))
}

function tables(sql) {
  return [...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+(baseball_private\.\w+)\s*\(([\s\S]*?)\)\s*;/gi)].map(match => [match[1], compact(match[2])])
}

function grants(sql, role) {
  const expression = new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+([^;]+?)\\s+TO\\s+${role}\\s*;`, 'gi')
  return [...clean(sql).matchAll(expression)].map(match => signature(match[1])).sort()
}

test('production migrations preserve all 24 original function bodies and signatures', () => {
  let count = 0
  for (let index = 0; index < originals.length; index++) {
    const before = functions(originals[index]), after = functions(production[index])
    assert.ok(before.length > 0, `source parser found no functions: ${sources[index]}`)
    const contract = ({ name, arguments: args, contract: header, body }) => ({ name, arguments: args, header, body })
    assert.deepEqual(after.map(contract), before.map(contract), migrations[index])
    count += before.length
  }
  assert.equal(count, 24)
})

test('production keeps 17 table definitions and every existing index unchanged', () => {
  let count = 0, indexCount = 0
  for (let index = 0; index < originals.length; index++) {
    const before = tables(originals[index])
    assert.deepEqual(tables(production[index]), before, migrations[index])
    const indices = sql => [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS[\s\S]*?;/gi)].map(match => compact(match[0]))
    assert.deepEqual(indices(production[index]), indices(originals[index]), `indexes: ${migrations[index]}`)
    indexCount += indices(originals[index]).length
    count += before.length
  }
  assert.equal(count, 17)
  assert.equal(indexCount, 9)
})

test('runtime executes exactly the original 17 RPCs; no helper is promoted', () => {
  const expected = grants(originals.join('\n'), 'baseball_runtime')
  const actual = grants(all, 'baseball_prod_runtime')
  assert.equal(expected.length, 17)
  assert.deepEqual(actual, expected)
  assert.equal(new Set(actual).size, 17)
  const exposedNames = new Set(actual.map(value => value.split('(')[0]))
  const helpers = functions(production.join('\n')).filter(fn => !exposedNames.has(fn.name))
  assert.equal(helpers.length, 7)
  for (const helper of helpers) {
    assert.match(all, new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+${helper.name.replace('.', '\\.')}\\s*\\([^;]+?\\)\\s+FROM\\s+PUBLIC\\s*,\\s*baseball_prod_runtime\\s*;`, 'i'), helper.name)
  }
  assert.doesNotMatch(clean(all), /GRANT\s+(?:ALL|EXECUTE)\s+ON\s+ALL\s+FUNCTIONS/i)
})

test('each production phase is isolated by database, owner and fixed SECURITY DEFINER search path', () => {
  for (const [index, sql] of [bootstrap, ...production].entries()) {
    assert.match(sql, /current_database\(\)\s*<>\s*'baseball_prod'/i, `phase ${index}`)
    assert.doesNotMatch(clean(sql), /\bbaseball_dev\b|(?:CREATE ROLE|TO|SET LOCAL ROLE)\s+baseball_runtime\b/i, `phase ${index}`)
    assert.doesNotMatch(clean(sql), /^\s*(?:DROP\s+(?:DATABASE|SCHEMA|TABLE)|TRUNCATE\s+(?:TABLE\s+)?baseball_private\.|ALTER\s+DATABASE\s+\w+\s+RENAME)\b/im)
  }
  for (const sql of production) {
    assert.match(sql, /SET\s+LOCAL\s+ROLE\s+baseball_prod_owner\s*;/i)
    for (const fn of functions(sql)) {
      if (fn.name === 'baseball_private.baseball_valid_career_v2_growth') {
        assert.doesNotMatch(fn.header, /SECURITY DEFINER/i)
        assert.match(fn.header, /IMMUTABLE SET search_path\s*=\s*pg_catalog$/i)
      } else {
        assert.match(fn.header, /SECURITY DEFINER/i, fn.name)
        assert.match(fn.header, /SET search_path\s*=\s*pg_catalog\s*,\s*baseball_private\s*,\s*pg_temp\s*$/i, fn.name)
      }
    }
  }
})

test('bootstrap separates nonlogin ownership from nonadmin login runtime without embedded credentials', () => {
  for (const [role, login] of [['baseball_prod_owner', 'NOLOGIN'], ['baseball_prod_runtime', 'LOGIN']]) {
    const statement = clean(bootstrap).match(new RegExp(`CREATE ROLE ${role}\\s+([^;]+);`, 'i'))?.[1]
    assert.ok(statement, role)
    for (const attribute of [login, 'NOSUPERUSER', 'NOCREATEDB', 'NOCREATEROLE', 'NOREPLICATION', 'NOINHERIT', 'NOBYPASSRLS']) assert.match(statement, new RegExp(`\\b${attribute}\\b`), `${role}: ${attribute}`)
  }
  assert.doesNotMatch(clean(all), /\bPASSWORD\s+(?:'|\$)|postgres(?:ql)?:\/\//i)
  assert.doesNotMatch(clean(all), /GRANT\s+baseball_prod_owner\s+TO\s+baseball_prod_runtime/i)
  assert.match(bootstrap, /pg_auth_members/)
  assert.match(bootstrap, /rolsuper[\s\S]*rolcreatedb[\s\S]*rolcreaterole[\s\S]*rolbypassrls/)
})

test('runtime receives no direct data, schema creation, temporary or owner permissions', () => {
  const code = clean(all)
  assert.doesNotMatch(code, /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|CREATE|TEMP(?:ORARY)?)\b[^;]*\bTO\s+(?:PUBLIC|baseball_prod_runtime)\b/i)
  assert.match(bootstrap, /REVOKE\s+ALL\s+ON\s+DATABASE\s+baseball_prod\s+FROM\s+PUBLIC\s*,\s*(?:baseball_prod_owner\s*,\s*)?baseball_prod_runtime/i)
  assert.match(bootstrap, /GRANT\s+CONNECT\s+ON\s+DATABASE\s+baseball_prod\s+TO\s+baseball_prod_runtime/i)
  assert.match(bootstrap, /REVOKE\s+ALL\s+ON\s+SCHEMA\s+public\s+FROM\s+PUBLIC\s*,\s*(?:baseball_prod_owner\s*,\s*)?baseball_prod_runtime/i)
  // Closing the app database alone still leaves a new role's implicit PUBLIC
  // CONNECT/TEMP permissions on this project's empty Neon default database.
  assert.match(bootstrap, /IF EXISTS\s*\(SELECT 1 FROM pg_catalog\.pg_database WHERE datname='neondb'\)/i)
  assert.match(bootstrap, /pg_has_role\(session_user,\s*\(SELECT datdba FROM pg_catalog\.pg_database WHERE datname='neondb'\),'USAGE'\)/i)
  assert.match(bootstrap, /REVOKE ALL ON DATABASE neondb FROM PUBLIC,baseball_prod_owner,baseball_prod_runtime/i)
  assert.match(bootstrap, /has_database_privilege\('baseball_prod_runtime','neondb','CONNECT,TEMP,CREATE'\)/i)
  const databaseRevokes = [...clean(bootstrap).matchAll(/REVOKE ALL ON DATABASE\s+(\w+)\s+FROM/g)].map(match => match[1])
  assert.deepEqual(databaseRevokes.sort(), ['baseball_prod', 'neondb'])
})

test('owner-wide default privileges remove the implicit PUBLIC function execute grant', () => {
  for (const kind of ['TABLES', 'SEQUENCES', 'FUNCTIONS']) {
    assert.match(bootstrap, new RegExp(`ALTER\\s+DEFAULT\\s+PRIVILEGES\\s+FOR\\s+ROLE\\s+baseball_prod_owner\\s+REVOKE\\s+ALL\\s+ON\\s+${kind}\\s+FROM\\s+PUBLIC\\s*,\\s*baseball_prod_runtime\\s*;`, 'i'), kind)
  }
  // A schema-only revoke cannot remove PostgreSQL's global PUBLIC EXECUTE default.
  assert.match(bootstrap, /ALTER DEFAULT PRIVILEGES FOR ROLE baseball_prod_owner REVOKE ALL ON FUNCTIONS FROM PUBLIC\s*,\s*baseball_prod_runtime/i)
})

test('regular-season migrations extend the same three RPCs under their existing permissions', async () => {
  const [dev, prod] = await Promise.all([
    read('db/migrations/20261126-baseball-career-regular-season.sql'),
    read('db/production/006-baseball-career-regular-season.sql'),
  ])
  const modified = functions(prod)
  assert.deepEqual(modified, functions(dev))
  assert.deepEqual(modified.map(fn => fn.name), [
    'baseball_private.baseball_list_careers_v2',
    'baseball_private.baseball_list_accessible_careers',
    'baseball_private.baseball_save_career_v2',
  ])
  for (const fn of modified) {
    const original = production.flatMap(functions).find(item => item.name === fn.name)
    assert.ok(original, fn.name)
    assert.equal(fn.arguments, original.arguments, fn.name)
    assert.equal(fn.header, original.header, fn.name)
  }
  assert.match(prod, /current_database\(\)\s*<>\s*'baseball_prod'/)
  assert.match(prod, /SET LOCAL ROLE baseball_prod_owner/)
  assert.match(dev, /current_database\(\)\s*<>\s*'baseball_dev'/)
  for (const sql of [prod, dev]) {
    const statements = clean(sql)
    assert.doesNotMatch(statements, /\b(?:CREATE ROLE|GRANT|REVOKE|TRUNCATE|DROP TABLE)\b/)
    assert.match(statements, /ALTER TABLE baseball_private\.career_v2_at_bats DROP CONSTRAINT IF EXISTS career_v2_at_bats_game_index_check/)
    assert.match(statements, /ADD CONSTRAINT baseball_career_v2_game_index_range CHECK\(game_index BETWEEN 0 AND 143\)/)
    assert.doesNotMatch(statements, /\b(?:TRUNCATE|UPDATE|DELETE FROM|ALTER TABLE)\s+baseball_private\.career_at_bats\b/)
  }
})

test('regular-season SQL keeps trial bounds and restricts two new appearances to the prepared game', async () => {
  const sql = await read('db/production/006-baseball-career-regular-season.sql')
  const [list, accessible, save] = functions(sql)
  assert.match(list.body, /'totalGames',jsonb_array_length\(snapshot->'games'\)/)
  assert.doesNotMatch(accessible.body.split(/\n\s+ELSE\n/)[0], /'totalGames'/)
  assert.match(accessible.body.split(/\n\s+ELSE\n/)[1], /'totalGames',jsonb_array_length\(snapshot->'games'\)/)
  assert.match(save.body, /game_count integer:=3/)
  assert.match(save.body, /scheduleId' IS DISTINCT FROM 'regular-144-v1'[\s\S]*?game_count:=144/)
  assert.match(save.body, /jsonb_array_length\(p_snapshot->'games'\)<>game_count/)
  assert.match(save.body, /IF game_count=144 AND jsonb_array_length\(p_at_bats\)=2 THEN[\s\S]*?old_item->'preparation'[\s\S]*?ledger_limit:=4/)
  assert.match(save.body, /slot_index<>current_game[\s\S]*?old_item IS DISTINCT FROM new_item/)
  assert.match(save.body, /gameIndex'\)::integer>=game_count/)
  assert.match(save.body, /batch_slot[\s\S]*?item->>'source' IS DISTINCT FROM 'automatic'/)
  assert.match(save.body, /jsonb_build_object\('status','stored','snapshot',prior.snapshot,'duplicate',true/)
})
