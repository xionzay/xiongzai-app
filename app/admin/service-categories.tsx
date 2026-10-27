"use client";

import { useEffect, useState } from "react";
import { adminApiRequest, adminFailure } from "./admin-api";
import styles from "./admin.module.css";

type Field = { key: string; label: string; required: boolean };
type Category = { id: string; name: string; enabled: boolean; fields: Field[]; version: number };
export function ServiceCategoriesModule({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [fields, setFields] = useState<Field[]>([]);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  async function reload() { setLoading(true); try { setRows(await adminApiRequest<Category[]>("/service-categories")); setError(""); } catch (cause) { setError(adminFailure(cause).message); } finally { setLoading(false); } }
  useEffect(() => {
    const controller = new AbortController();
    void adminApiRequest<Category[]>("/service-categories", { signal: controller.signal }).then((items) => { if (!controller.signal.aborted) setRows(items); }).catch((cause) => { if (!controller.signal.aborted) setError(adminFailure(cause).message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  function edit(row: Category | null) { setSelected(row); setName(row?.name ?? ""); setEnabled(row?.enabled ?? true); setFields(row?.fields.map((field) => ({ ...field })) ?? []); setReason(""); setNotice(""); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setNotice("");
    try {
      await adminApiRequest(selected ? `/service-categories/${selected.id}` : "/service-categories", { method: selected ? "PATCH" : "POST", body: JSON.stringify({ name, enabled, fields, reason, ...(selected ? { version: selected.version } : {}) }) });
      edit(null); await reload(); setNotice("分类已保存。修改只影响后续编辑与提交，已审核服务和历史订单保留原内容。");
    } catch (cause) { setNotice(adminFailure(cause).message); } finally { setBusy(false); }
  }
  return <><header><h1>服务分类管理</h1><p>配置游戏服务的发布字段。停用分类将阻止新提交，不会自动下架现有服务。</p></header>
    {error ? <div role="alert">{error}<button onClick={() => void reload()}>重试</button></div> : null}
    {loading ? <p role="status">正在加载分类…</p> : <div className={styles.tableCard}><table><thead><tr><th>分类</th><th>状态</th><th>发布字段</th><th>操作</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.enabled ? "启用" : "停用"}</td><td>{row.fields.map((field) => `${field.label}${field.required ? "（必填）" : ""}`).join("、") || "无附加字段"}</td><td>{canManage ? <button disabled={busy} onClick={() => edit(row)}>编辑</button> : "只读"}</td></tr>)}</tbody></table>{rows.length === 0 ? <p>暂无分类，请先创建。</p> : null}</div>}
    {canManage ? <form onSubmit={(event) => void save(event)} className={`${styles.detailSection} ${styles.categoryForm}`}>
      <h2>{selected ? "编辑分类" : "新建分类"}</h2>
      <label>分类名称 <input required maxLength={80} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
      <label><input type="checkbox" checked={enabled} disabled={busy} onChange={(event) => setEnabled(event.target.checked)} />启用</label>
      <p>字段标识使用英文小写字母、数字和下划线，以字母开头。字段内容为公开服务信息，请勿收集密码或身份资料。</p>
      {fields.map((field, index) => <fieldset key={index} disabled={busy}><legend>字段 {index + 1}</legend>
        <label>字段标识 <input required pattern="[a-z][a-z0-9_]{0,39}" maxLength={40} value={field.key} onChange={(event) => setFields(fields.map((item, i) => i === index ? { ...item, key: event.target.value } : item))} /></label>
        <label>显示名称 <input required maxLength={80} value={field.label} onChange={(event) => setFields(fields.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} /></label>
        <label><input type="checkbox" checked={field.required} onChange={(event) => setFields(fields.map((item, i) => i === index ? { ...item, required: event.target.checked } : item))} />必填</label>
        <button type="button" onClick={() => setFields(fields.filter((_, i) => i !== index))}>移除此字段</button>
      </fieldset>)}
      <button type="button" disabled={busy || fields.length >= 20} onClick={() => setFields([...fields, { key: "", label: "", required: false }])}>添加字段</button>
      <label>变更原因 <input required minLength={2} maxLength={1000} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
      <button type="submit" disabled={busy}>{busy ? "保存中…" : "保存分类"}</button>
      {selected ? <button type="button" disabled={busy} onClick={() => edit(null)}>取消编辑</button> : null}
    </form> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </>;
}
