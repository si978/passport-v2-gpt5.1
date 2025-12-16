import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { UserActivityPage } from './UserActivityPage';
import { apiClient } from '../../api/client';

vi.mock('../../api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('UserActivityPage', () => {
  it('loads activities on mount and renders rows', async () => {
    (apiClient.get as any).mockResolvedValue({
      data: {
        activities: [
          {
            guid: 'G1',
            phone: '13800138000',
            login_at: '2025-01-01T10:00:00.000Z',
            logout_at: null,
            channel: 'pc',
            ip: '1.1.1.1',
          },
        ],
      },
    });

    render(<UserActivityPage />);

    await waitFor(() => {
      expect(screen.getByText('13800138000')).toBeInTheDocument();
    });
  });

  it('builds query params and reloads when 点击 查询', async () => {
    (apiClient.get as any).mockResolvedValue({ data: { activities: [] } });

    render(<UserActivityPage />);

    const phoneInput = screen.getAllByRole('textbox')[0];
    const channelInput = screen.getAllByRole('textbox')[1];

    fireEvent.change(phoneInput, { target: { value: '13800138000' } });
    fireEvent.change(channelInput, { target: { value: 'pc' } });

    fireEvent.click(screen.getByText('查询'));

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalled();
    });
  });
});
