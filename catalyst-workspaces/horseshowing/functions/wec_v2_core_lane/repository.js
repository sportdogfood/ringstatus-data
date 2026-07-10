'use strict';

const { manifest } = require('./contract');

function assertV2Table(tableName) {
  const value = String(tableName || '').trim();
  if (!value.startsWith('wec_v2_')) throw new Error(`legacy_table_write_blocked:${value}`);
  return value;
}

function unwrapZcql(tableName, rows) {
  return (rows || []).map((row) => row?.[tableName] || row).filter(Boolean);
}

function zcqlValue(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function createRepository(app) {
  const zcql = app.zcql();

  async function query(tableName, queryText) {
    const rows = await zcql.executeZCQLQuery(queryText);
    return unwrapZcql(tableName, rows);
  }

  async function findByKey(tableName, keyField, keyValue) {
    assertV2Table(tableName);
    const rows = await query(
      tableName,
      `SELECT * FROM ${tableName} WHERE ${keyField} = ${zcqlValue(keyValue)} LIMIT 0, 1`
    );
    return rows[0] || null;
  }

  async function upsert(tableName, keyField, row) {
    assertV2Table(tableName);
    const keyValue = row?.[keyField];
    if (!keyValue) throw new Error(`key_required:${tableName}.${keyField}`);
    const table = app.datastore().table(tableName);
    const existing = await findByKey(tableName, keyField, keyValue);
    if (existing?.ROWID) return table.updateRow({ ...row, ROWID: existing.ROWID });
    return table.insertRow(row);
  }

  async function insert(tableName, row) {
    assertV2Table(tableName);
    return app.datastore().table(tableName).insertRow(row);
  }

  async function list(tableName, where = '', limit = 300) {
    assertV2Table(tableName);
    const clause = where ? ` WHERE ${where}` : '';
    return query(tableName, `SELECT * FROM ${tableName}${clause} LIMIT 0, ${Math.min(300, Number(limit || 300))}`);
  }

  async function tableExists(tableName) {
    try {
      await list(tableName, '', 1);
      return true;
    } catch (_error) {
      return false;
    }
  }

  return {
    async schemaStatus() {
      const required = Object.values(manifest.tables);
      const checks = await Promise.all(required.map(async (table) => ({ table, exists: await tableExists(table) })));
      return {
        ready: checks.every((item) => item.exists),
        missing_tables: checks.filter((item) => !item.exists).map((item) => item.table)
      };
    },
    findByKey,
    insert,
    list,
    query,
    async saveDataset(row) {
      return upsert(manifest.tables.datasets, 'dataset_key', row);
    },
    async saveWork(row) {
      return upsert(manifest.tables.work_queue, 'work_key', row);
    },
    async saveRaw(row) {
      return upsert(manifest.tables.class_oog_raw, 'raw_key', row);
    },
    async appendChange(row) {
      const existing = await findByKey(manifest.tables.change_log, 'change_key', row.change_key);
      return existing || insert(manifest.tables.change_log, row);
    },
    upsert
  };
}

module.exports = {
  assertV2Table,
  createRepository,
  unwrapZcql,
  zcqlValue
};
