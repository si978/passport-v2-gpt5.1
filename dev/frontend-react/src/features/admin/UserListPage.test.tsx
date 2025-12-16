import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { UserListPage } from './UserListPage';
import { apiClient } from '../../api/client';

vi.mock('../../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('UserListPage', () => {
  it('loads and renders user rows', async () => {
    (apiClient.get as any).mockResolvedValue({
      data: {
        users: [
          { guid: 'G1', phone: '13800138000', status: 'ACTIVE', account_source: 'phone' },
        ],
      },
    });

    render(<UserListPage />);

    await waitFor(() => {
      expect(screen.getByText('13800138000')).toBeInTheDocument();
    });
  });

  it('sends ban request when clicking 封禁 按钮', async () => {
    (apiClient.get as any).mockResolvedValueOnce({
      data: {
        users: [
          { guid: 'G1', phone: '13800138000', status: 'ACTIVE', account_source: 'phone' },
        ],
      },
    });
    (apiClient.post as any).mockResolvedValue({});

    render(<UserListPage />);

    await waitFor(() => {
      expect(screen.getAllByText('封禁').length).toBeGreaterThan(0);
    });

    const banButtons = screen.getAllByRole('button', { name: '封禁' });
    fireEvent.click(banButtons[0]);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/admin/users/G1/ban');
    });
  });
});
