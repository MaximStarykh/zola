import { getAccessToken, useUser as usePrivyUser } from '@privy-io/react-auth';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { UserProvider, useUser } from '@/lib/user-store/provider';
import { UserProfile } from '@/lib/user/types';

// Mock Privy hooks and fetch
vi.mock('@privy-io/react-auth', () => ({
  useUser: vi.fn(),
  getAccessToken: vi.fn(),
}));
global.fetch = vi.fn();

// Cast the imported hooks to their mocked type
const mockPrivyUser = usePrivyUser as vi.Mock;
const mockGetAccessToken = getAccessToken as vi.Mock;

const TestComponent = () => {
  const { user, isLoading } = useUser();
  if (isLoading) return <div>Loading...</div>;
  if (user) return <div>Welcome, {user.display_name}</div>;
  return <div>Please log in.</div>;
};

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();
  });

  it('should handle user login and sync', async () => {
    // Arrange: User is authenticated with Privy
    mockPrivyUser.mockReturnValue({ authenticated: true, user: { id: 'privy-123' } });
    mockGetAccessToken.mockResolvedValue('fake-access-token');

    const mockUserProfile: UserProfile = {
      id: 'privy-123',
      display_name: 'Test User',
      email: 'test@example.com',
      profile_image: '',
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUserProfile,
    });

    // Act
    render(
      <UserProvider>
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      </UserProvider>
    );

    // Assert
    // Initially, it might show loading or the logged-out state
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Wait for the user to be synced and the state to update
    await waitFor(() => {
      expect(screen.getByText('Welcome, Test User')).toBeInTheDocument();
    });

    // Verify fetch was called correctly
    expect(global.fetch).toHaveBeenCalledWith('/api/privy/sync-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: 'fake-access-token' }),
    });
  });

  it('should handle user logout', async () => {
    // Arrange: User is not authenticated
    mockPrivyUser.mockReturnValue({ authenticated: false, user: null });

    // Act
    render(
      <UserProvider>
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      </UserProvider>
    );

    // Assert
    await waitFor(() => {
        expect(screen.getByText('Please log in.')).toBeInTheDocument();
    })
  });
});
