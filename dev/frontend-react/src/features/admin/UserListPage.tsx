import React, { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { getAdminRoles } from '../auth/tokenStorage';

type UserStatus = 'ACTIVE' | 'BANNED' | 'DELETED';

interface UserVm {
  guid: string;
  phone: string;
  status: UserStatus;
  account_source: string;
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
      <path
        d="M9 9h10v12H9V9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function renderStatusBadge(status: UserStatus) {
  if (status === 'ACTIVE') {
    return <span className="passport-admin__badge passport-admin__badge--active">正常</span>;
  }
  if (status === 'BANNED') {
    return <span className="passport-admin__badge passport-admin__badge--banned">封禁</span>;
  }
  return <span className="passport-admin__badge passport-admin__badge--deleted">注销</span>;
}

function renderAccountSource(raw: string): string {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return '-';
  if (v === 'admin') return '管理员';
  if (v === 'phone') return '短信验证';
  if (v === 'sso') return '单点登录';
  return raw;
}

function useClientPagination<T>(rows: T[]) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;
  const pageRows = rows.slice(start, end);

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [page, safePage]);

  return {
    page: safePage,
    pageSize,
    total,
    totalPages,
    pageRows,
    setPage,
    setPageSize: (next: number) => {
      setPage(1);
      setPageSize(next);
    },
  };
}

export const UserListPage: React.FC = () => {
  const [users, setUsers] = useState<UserVm[]>([]);
  const [status, setStatus] = useState<UserStatus | 'ALL'>('ALL');
  const canOperate = getAdminRoles().includes('OPERATOR');
  const pager = useClientPagination(users);

  useEffect(() => {
    loadUsers(status, setUsers);
  }, [status]);

  useEffect(() => {
    pager.setPage(1);
  }, [status]);

  return (
    <div>
      <div className="passport-admin__pageHeader">
        <div>
          <h1 className="passport-admin__title">后台用户列表</h1>
          <div className="passport-admin__subtitle">查看/封禁/解封用户</div>
        </div>
      </div>

      <section className="passport-admin__card passport-admin__filters" aria-label="筛选条件">
        <div className="passport-admin__fieldRow">
          <span className="passport-admin__label">状态</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="passport-admin__select"
            aria-label="状态筛选"
          >
            <option value="ALL">全部</option>
            <option value="ACTIVE">正常</option>
            <option value="BANNED">封禁</option>
            <option value="DELETED">注销</option>
          </select>
        </div>
      </section>

      <section className="passport-admin__card passport-admin__tableCard" aria-label="用户列表">
        <div className="passport-admin__tableWrap">
          <table className="passport-admin__table">
            <thead>
              <tr>
                <th style={{ width: 320 }}>GUID</th>
                <th style={{ width: 140 }}>手机号</th>
                <th style={{ width: 110 }}>状态</th>
                <th style={{ width: 140 }}>来源</th>
                <th style={{ width: 120 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {pager.pageRows.map((u) => (
                <tr key={u.guid}>
                  <td>
                    <div className="passport-admin__guidCell">
                      <span className="passport-admin__ellipsis passport-admin__muted" title={u.guid}>
                        {u.guid}
                      </span>
                      <button
                        type="button"
                        className="passport-admin__iconBtn"
                        aria-label="复制 GUID"
                        onClick={async () => {
                          await copyText(u.guid);
                        }}
                      >
                        <CopyIcon />
                      </button>
                    </div>
                  </td>
                  <td>{u.phone}</td>
                  <td>{renderStatusBadge(u.status)}</td>
                  <td>{renderAccountSource(u.account_source)}</td>
                  <td>
                    {!canOperate && <span className="passport-admin__muted">—</span>}
                    {canOperate && u.status === 'ACTIVE' && (
                      <button
                        type="button"
                        className="passport-admin__linkBtn passport-admin__linkBtn--danger"
                        onClick={() => handleBanToggle(u.guid, true, status, setUsers)}
                      >
                        封禁
                      </button>
                    )}
                    {canOperate && u.status === 'BANNED' && (
                      <button
                        type="button"
                        className="passport-admin__linkBtn passport-admin__linkBtn--primary"
                        onClick={() => handleBanToggle(u.guid, false, status, setUsers)}
                      >
                        解封
                      </button>
                    )}
                    {canOperate && u.status === 'DELETED' && <span className="passport-admin__muted">—</span>}
                  </td>
                </tr>
              ))}
              {pager.pageRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="passport-admin__muted" style={{ padding: '18px 12px' }}>
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="passport-admin__pagination" aria-label="分页">
          <div>共 {pager.total} 条</div>
          <div className="passport-admin__pageControls">
            <button
              type="button"
              className="passport-admin__pageBtn"
              disabled={pager.page <= 1}
              aria-label="上一页"
              onClick={() => pager.setPage(Math.max(1, pager.page - 1))}
            >
              ‹
            </button>
            {Array.from({ length: pager.totalPages }, (_, i) => i + 1)
              .slice(0, 5)
              .map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`passport-admin__pageBtn${p === pager.page ? ' is-active' : ''}`}
                  onClick={() => pager.setPage(p)}
                >
                  {p}
                </button>
              ))}
            {pager.totalPages > 5 && <span className="passport-admin__pageDots">…</span>}
            <button
              type="button"
              className="passport-admin__pageBtn"
              disabled={pager.page >= pager.totalPages}
              aria-label="下一页"
              onClick={() => pager.setPage(Math.min(pager.totalPages, pager.page + 1))}
            >
              ›
            </button>
          </div>
          <div className="passport-admin__pageSize">
            <select
              className="passport-admin__select passport-admin__selectSmall"
              value={pager.pageSize}
              onChange={(e) => pager.setPageSize(Number(e.target.value))}
              aria-label="每页条数"
            >
              <option value={10}>10条/页</option>
              <option value={20}>20条/页</option>
              <option value={50}>50条/页</option>
            </select>
          </div>
        </div>
      </section>
    </div>
  );
};

async function loadUsers(status: UserStatus | 'ALL', setUsers: (rows: UserVm[]) => void) {
  try {
    const resp = await apiClient.get('/admin/users', {
      params: status === 'ALL' ? {} : { status },
    });
    setUsers(resp.data.users ?? []);
  } catch (e) {
    console.error('load users failed', e);
  }
}

async function handleBanToggle(
  guid: string,
  ban: boolean,
  status: UserStatus | 'ALL',
  setUsers: (rows: UserVm[]) => void,
) {
  try {
    const path = ban ? `/admin/users/${guid}/ban` : `/admin/users/${guid}/unban`;
    await apiClient.post(path);
    await loadUsers(status, setUsers);
  } catch (e) {
    console.error('update user status failed', e);
    alert('操作失败，请稍后重试');
  }
}
