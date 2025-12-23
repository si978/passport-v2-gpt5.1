import React, { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';

interface ActivityRow {
  guid: string;
  phone: string;
  login_at: string;
  logout_at?: string | null;
  channel?: string | null;
  ip?: string | null;
   mac?: string | null;
   gateway?: string | null;
   cafe_name?: string | null;
}

const escapeCSV = (value: string): string => {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export const UserActivityPage: React.FC = () => {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    loadActivities();
  }, []);

  const loadActivities = async () => {
    try {
      const params: Record<string, string> = {};
      if (phone) params.phone = phone;
      if (channel) params.channel = channel;
      if (start) params.start = new Date(start).toISOString();
      if (end) params.end = new Date(end).toISOString();
      const resp = await apiClient.get('/admin/activity', { params });
      setRows(resp.data.activities ?? []);
      setPage(1);
    } catch (e) {
      console.error('load activities failed', e);
    }
  };

  const handleExport = () => {
    if (!rows.length) {
      alert('当前没有可导出的数据');
      return;
    }
    const header = ['guid', 'phone', 'login_at', 'logout_at', 'channel', 'ip', 'mac', 'gateway', 'cafe_name'];
    const lines = rows.map((r) => [
      escapeCSV(r.guid),
      escapeCSV(r.phone),
      escapeCSV(r.login_at),
      escapeCSV(r.logout_at ?? ''),
      escapeCSV(r.channel ?? ''),
      escapeCSV(r.ip ?? ''),
      escapeCSV(r.mac ?? ''),
      escapeCSV(r.gateway ?? ''),
      escapeCSV(r.cafe_name ?? ''),
    ].join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user-activity-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pageRows = rows.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  return (
    <div>
      <div className="passport-admin__pageHeader">
        <div>
          <h1 className="passport-admin__title">用户活跃明细</h1>
          <div className="passport-admin__subtitle">查询与导出登录活跃记录</div>
        </div>
        <button type="button" className="passport-admin__btn" onClick={handleExport}>
          导出当前结果
        </button>
      </div>

      <section className="passport-admin__card passport-admin__filters" aria-label="筛选条件">
        <div className="passport-admin__fieldRow">
          <span className="passport-admin__label">手机号</span>
          <input
            className="passport-admin__input"
            placeholder="请输入手机号"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <span className="passport-admin__label">渠道</span>
          <input
            className="passport-admin__input"
            placeholder="请输入渠道"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          />
        </div>
        <div className="passport-admin__fieldRow" style={{ marginTop: 10 }}>
          <span className="passport-admin__label">开始时间</span>
          <input
            className="passport-admin__input"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <span className="passport-admin__label">结束时间</span>
          <input
            className="passport-admin__input"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
          <button type="button" className="passport-admin__btn passport-admin__btnPrimary" onClick={loadActivities}>
            查询
          </button>
          <button
            type="button"
            className="passport-admin__btn"
            onClick={() => {
              setPhone('');
              setChannel('');
              setStart('');
              setEnd('');
              setRows([]);
              setPage(1);
            }}
          >
            清空
          </button>
        </div>
      </section>

      <section className="passport-admin__card passport-admin__tableCard" aria-label="活跃明细">
        <div className="passport-admin__tableWrap">
          <table className="passport-admin__table" style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={{ width: 300 }}>GUID</th>
                <th style={{ width: 140 }}>手机号</th>
                <th style={{ width: 170 }}>登录时间</th>
                <th style={{ width: 170 }}>退出时间</th>
                <th style={{ width: 120 }}>渠道</th>
                <th style={{ width: 140 }}>IP</th>
                <th style={{ width: 150 }}>MAC</th>
                <th style={{ width: 140 }}>网关</th>
                <th style={{ width: 140 }}>网吧名称</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={`${r.guid}-${r.login_at}`}>
                  <td>
                    <span className="passport-admin__ellipsis passport-admin__muted" title={r.guid}>
                      {r.guid}
                    </span>
                  </td>
                  <td>{r.phone}</td>
                  <td>{r.login_at}</td>
                  <td>{r.logout_at ?? '-'}</td>
                  <td>{r.channel ?? '-'}</td>
                  <td>{r.ip ?? '-'}</td>
                  <td>{r.mac ?? '-'}</td>
                  <td>{r.gateway ?? '-'}</td>
                  <td>{r.cafe_name ?? '-'}</td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="passport-admin__muted" style={{ padding: '18px 12px' }}>
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="passport-admin__pagination" aria-label="分页">
          <div>共 {total} 条</div>
          <div className="passport-admin__pageControls">
            <button
              type="button"
              className="passport-admin__pageBtn"
              disabled={safePage <= 1}
              aria-label="上一页"
              onClick={() => setPage(Math.max(1, safePage - 1))}
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .slice(0, 5)
              .map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`passport-admin__pageBtn${p === safePage ? ' is-active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
            {totalPages > 5 && <span className="passport-admin__pageDots">…</span>}
            <button
              type="button"
              className="passport-admin__pageBtn"
              disabled={safePage >= totalPages}
              aria-label="下一页"
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
            >
              ›
            </button>
          </div>
          <div className="passport-admin__pageSize">
            <select
              className="passport-admin__select passport-admin__selectSmall"
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value));
              }}
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
