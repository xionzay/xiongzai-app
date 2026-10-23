"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminApiRequest, adminFailure } from "./admin-api";
import { loadRbacAdmin, loadRbacOptions, sameRoleIds, type RbacAdmin, type RbacPermission, type RbacRole } from "./rbac-data";
import styles from "./admin.module.css";

type Failure = ReturnType<typeof adminFailure>;
type Confirmation = { title: string; note: string; action: string; reasonRequired?: boolean; danger?: boolean; onConfirm: (reason: string, secondary: string) => Promise<void> };
type Props = {
  mode: "admins" | "roles"; canManage: boolean; listReady?: boolean; rows: Record<string, unknown>[];
  reload: () => void; setModal: (modal: Confirmation) => void;
  runAction: (request: () => Promise<unknown>, options: { success: string; reload: () => void | Promise<void> }) => Promise<void>;
};

export function RbacManagementPanel({ mode, canManage, listReady = true, rows, reload, setModal, runAction }: Props) {
  const canLoad = canManage && listReady;
  type Options = { roles: RbacRole[]; permissions: RbacPermission[] };
  const [optionResult, setOptionResult] = useState<{ data: Options; rows: Props["rows"]; revision: number } | null>(null);
  const [optionsFailure, setOptionsFailure] = useState<Failure | null>(null);
  const [optionsRevision, setOptionsRevision] = useState(0);
  const options = canLoad && optionResult?.rows === rows && optionResult.revision === optionsRevision ? optionResult.data : null;
  const [targetId, setTargetId] = useState("");
  const [selectionResult, setSelectionResult] = useState<{ admin: RbacAdmin; options: Options; revision: number } | null>(null);
  const [selectionFailure, setSelectionFailure] = useState<Failure | null>(null);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const selected = selectionResult?.options === options && selectionResult?.admin.id === targetId && selectionResult.revision === selectionRevision ? selectionResult.admin : null;
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set());
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [roleKey, setRoleKey] = useState(""); const [roleName, setRoleName] = useState("");
  const [permissionKeys, setPermissionKeys] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false); const submitting = useRef(false);
  const selectionRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!canLoad) return;
    const controller = new AbortController(); let active = true;
    loadRbacOptions(controller.signal).then(result => { if (active) { setOptionResult({ data: result, rows, revision: optionsRevision }); setOptionsFailure(null); } }).catch(cause => { if (active) setOptionsFailure(adminFailure(cause)); });
    return () => { active = false; controller.abort(); };
  }, [canLoad, rows, optionsRevision]);

  const refreshSelection = useCallback(async () => {
    selectionRequest.current?.abort();
    if (!canLoad || !targetId || !options) return;
    const controller = new AbortController(); selectionRequest.current = controller;
    try {
      const admin = await loadRbacAdmin(targetId, options.roles, controller.signal);
      if (controller.signal.aborted) return;
      setSelectionResult({ admin, options, revision: selectionRevision }); setSelectionFailure(null); setRoleIds(new Set(admin.roles.map(role => role.id))); setConfirmEmpty(false);
    } catch (cause) { if (!controller.signal.aborted) setSelectionFailure(adminFailure(cause)); }
  }, [canLoad, targetId, options, selectionRevision]);
  useEffect(() => {
    selectionRequest.current?.abort();
    if (!canLoad || !targetId || !options) return;
    const controller = new AbortController(); selectionRequest.current = controller;
    loadRbacAdmin(targetId, options.roles, controller.signal).then(admin => {
      if (controller.signal.aborted) return;
      setSelectionResult({ admin, options, revision: selectionRevision }); setSelectionFailure(null); setRoleIds(new Set(admin.roles.map(role => role.id))); setConfirmEmpty(false);
    }).catch(cause => { if (!controller.signal.aborted) setSelectionFailure(adminFailure(cause)); });
    return () => controller.abort();
  }, [canLoad, targetId, options, selectionRevision]);

  const ready = Boolean(canLoad && options && selected?.id === targetId);
  const unchanged = Boolean(selected && sameRoleIds(roleIds, selected.roles.map(role => role.id)));
  const canSave = ready && !unchanged && !pending && (roleIds.size > 0 || confirmEmpty);
  function chooseAdmin(id: string) {
    selectionRequest.current?.abort(); setSelectionResult(null); setRoleIds(new Set()); setConfirmEmpty(false); setSelectionFailure(null); setTargetId(id);
  }
  function assign() {
    if (!canSave || !selected) return;
    const admin = selected; const ids = [...roleIds]; const emptyConfirmed = confirmEmpty;
    setModal({ title: "修改管理员角色", note: `${admin.display_name} · ${ids.length ? `${ids.length} 个角色` : "明确清空所有角色，将失去全部业务权限"} · 使用服务端版本 ${admin.version}；保留最后一个可用超级管理员`, action: "确认修改", reasonRequired: true, danger: true,
      onConfirm: async reason => {
        if (submitting.current) return;
        submitting.current = true; setPending(true);
        try {
          await runAction(() => adminApiRequest(`/rbac/admins/${admin.id}/roles`, { method: "PATCH", body: JSON.stringify({ role_ids: ids, version: admin.version, confirm_empty_roles: ids.length === 0 && emptyConfirmed, reason }) }),
            { success: "管理员角色已由服务端更新并记录历史", reload: async () => { reload(); await refreshSelection(); } });
        } finally { submitting.current = false; setPending(false); }
      } });
  }
  function createRole() {
    if (!canLoad || !options || pending || roleKey.trim().length < 3 || roleName.trim().length < 2) return;
    setModal({ title: "创建权限角色", note: `${roleName.trim()} · ${permissionKeys.size} 项最小权限`, action: "确认创建", reasonRequired: true,
      onConfirm: async reason => {
        if (submitting.current) return;
        submitting.current = true; setPending(true);
        try { await runAction(() => adminApiRequest("/rbac/roles", { method: "POST", body: JSON.stringify({ key: roleKey.trim(), name: roleName.trim(), permission_keys: [...permissionKeys], reason }) }),
          { success: "角色已由服务端创建并审计", reload: () => { reload(); setOptionsRevision(value => value + 1); } });
        } finally { submitting.current = false; setPending(false); }
      } });
  }
  if (!canManage) return <section className={styles.fileNotice}>当前账号只有查看权限；修改管理员与角色需要对应的读取权限，以及 admin.manage 和 role.manage。</section>;
  const failure = optionsFailure ?? selectionFailure;
  return <section className={styles.configCard} style={{ marginBottom: 16 }} aria-busy={!options && !optionsFailure || pending}>
    <header><div><b>{mode === "admins" ? "管理员角色分配" : "新建角色"}</b><span>{mode === "admins" ? "读取最新角色与版本后才允许修改；变更历史可在详情中查看" : "只选择岗位需要的最小权限"}</span></div></header>
    <div style={{ padding: 18 }}>
      {!options && !optionsFailure ? <p role="status">{listReady ? "正在加载完整角色与权限选项…" : "等待管理员列表重新加载，暂不可修改角色…"}</p> : null}
      {failure ? <div className={styles.loginError} role="alert">{failure.message}{failure.requestId ? <small>请求编号：{failure.requestId}</small> : null}<button type="button" onClick={() => { setOptionResult(null); setSelectionResult(null); setOptionsFailure(null); setSelectionFailure(null); setOptionsRevision(value => value + 1); setSelectionRevision(value => value + 1); }}>重新加载角色数据</button></div> : null}
      {mode === "admins" ? <>
        <label>管理员<select value={targetId} disabled={!options || pending} onChange={event => chooseAdmin(event.target.value)}><option value="">请选择管理员</option>{rows.map(row => <option key={String(row.id)} value={String(row.id)}>{String(row.display_name)}（{String(row.username)}）</option>)}</select></label>
        {options && targetId && !selected && !selectionFailure ? <p role="status">正在读取管理员最新角色与版本…</p> : null}
        <fieldset disabled={!ready || pending} style={{ border: 0, padding: 0, marginTop: 12 }}><legend>分配角色</legend><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8, maxHeight: 320, overflow: "auto" }}>{options?.roles.map(role => <label key={role.id}><input type="checkbox" checked={roleIds.has(role.id)} onChange={event => { setConfirmEmpty(false); setRoleIds(current => { const next = new Set(current); if (event.target.checked) next.add(role.id); else next.delete(role.id); return next; }); }} />{role.name} <small>{role.key}</small></label>)}</div>
          {ready && roleIds.size === 0 && !unchanged ? <label><input type="checkbox" checked={confirmEmpty} onChange={event => setConfirmEmpty(event.target.checked)} />我明确确认清空该管理员的所有角色</label> : null}</fieldset>
        <button type="button" disabled={!canSave} onClick={assign}>{pending ? "正在保存…" : "保存角色分配"}</button>
      </> : <>
        <label>角色键<input value={roleKey} disabled={!options || pending} onChange={event => setRoleKey(event.target.value)} placeholder="operations_reviewer" /></label><label>角色名称<input value={roleName} disabled={!options || pending} onChange={event => setRoleName(event.target.value)} placeholder="运营复核员" /></label>
        <fieldset disabled={!options || pending} style={{ border: 0, padding: 0, marginTop: 12 }}><legend>角色权限</legend><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8, maxHeight: 260, overflow: "auto" }}>{options?.permissions.map(permission => <label key={permission.key}><input type="checkbox" checked={permissionKeys.has(permission.key)} onChange={event => setPermissionKeys(current => { const next = new Set(current); if (event.target.checked) next.add(permission.key); else next.delete(permission.key); return next; })} />{permission.description || permission.key}<small> {permission.key}{permission.high_risk ? " · 高风险" : ""}</small></label>)}</div></fieldset>
        <button type="button" disabled={!options || pending || roleKey.trim().length < 3 || roleName.trim().length < 2} onClick={createRole}>{pending ? "正在创建…" : "创建角色"}</button>
      </>}
    </div>
  </section>;
}
