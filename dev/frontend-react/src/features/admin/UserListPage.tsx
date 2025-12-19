import React, { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { LogoutButton } from '../auth/LogoutButton';
import { getAdminRoles } from '../auth/tokenStorage';

type UserStatus = 'ACTIVE' | 'BANNED' | 'DELETED';

interface UserVm {
  guid: string;
  phone: string;
  status: UserStatus;
  account_source: string;
}

export const UserListPage: React.FC = () => {
  const [users, setUsers] = useState<UserVm[]>([]);
  const [status, setStatus] = useState<UserStatus | 'ALL'>('ALL');
  const canOperate = getAdminRoles().includes('OPERATOR');

  useEffect(() => {
    loadUsers(status, setUsers);
  }, [status]);

  return (
    <main>
      <h1>后台用户列表</h1>
      <LogoutButton />
      <div>
        状态：
        <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="ALL">全部</option>
          <option value="ACTIVE">正常</option>
          <option value="BANNED">封禁</option>
          <option value="DELETED">注销</option>
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <th>GUID</th>
            <th>手机号</th>
            <th>状态</th>
            <th>来源</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.guid}>
              <td>{u.guid}</td>
              <td>{u.phone}</td>
              <td>{u.status}</td>
              <td>{u.account_source}</td>
              <td>
                {!canOperate && '-'}
                {canOperate && u.status === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={() => handleBanToggle(u.guid, true, status, setUsers)}
                  >
                    封禁
                  </button>
                )}
                {canOperate && u.status === 'BANNED' && (
                  <button
                    type="button"
                    onClick={() => handleBanToggle(u.guid, false, status, setUsers)}
                  >
                    解封
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
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
