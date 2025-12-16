import React, { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { LogoutButton } from '../auth/LogoutButton';

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

  return (
    <main>
      <h1>用户活跃明细</h1>
      <LogoutButton />
      <section>
        <div>
          手机号：
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          渠道：
          <input value={channel} onChange={(e) => setChannel(e.target.value)} />
        </div>
        <div>
          开始时间：
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          结束时间：
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          <button type="button" onClick={loadActivities}>
            查询
          </button>
        </div>
      </section>
      <button type="button" onClick={handleExport}>
        导出当前结果
      </button>
      <table>
        <thead>
          <tr>
            <th>GUID</th>
            <th>手机号</th>
            <th>登录时间</th>
            <th>退出时间</th>
            <th>渠道</th>
            <th>IP</th>
            <th>MAC</th>
            <th>网关</th>
            <th>网吧名称</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.guid}-${r.login_at}`}>
              <td>{r.guid}</td>
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
        </tbody>
      </table>
    </main>
  );
};
