export declare class AuthService {
    register(email: string, username: string, password: string): Promise<{
        token: string;
        user: {
            id: number;
            email: string;
            username: string;
            role: string;
        };
    }>;
    login(email: string, password: string): Promise<{
        token: string;
        user: {
            id: number;
            email: string;
            username: string;
            role: string;
        };
    }>;
    getProfile(userId: number): Promise<{
        id: number;
        isActive: boolean;
        createdAt: Date;
        urls: {
            id: number;
            shortCode: string;
            longUrl: string;
            title: string | null;
            clicks: bigint;
            expiresAt: Date | null;
            isActive: boolean;
            tags: string[];
            createdAt: Date;
        }[];
        email: string;
        username: string;
        role: string;
    } | null>;
    getAllUsers(page?: number, limit?: number, search?: string): Promise<{
        users: {
            id: number;
            isActive: boolean;
            createdAt: Date;
            _count: {
                urls: number;
            };
            email: string;
            username: string;
            role: string;
        }[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    updateUser(adminUserId: number, targetUserId: number, data: {
        isActive?: boolean;
        role?: string;
    }): Promise<{
        id: number;
        isActive: boolean;
        email: string;
        username: string;
        role: string;
    }>;
    deleteUser(adminUserId: number, targetUserId: number): Promise<void>;
}
export declare const authService: AuthService;
//# sourceMappingURL=auth.service.d.ts.map