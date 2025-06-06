import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '@/lib/firebase'; // Firestore db 인스턴스
import {
  collection,
  query,
  where,
  getDocs,
  DocumentData,
} from 'firebase/firestore';

// 비밀번호 해싱을 위한 라이브러리 (예: bcrypt) - 실제 프로덕션에서는 반드시 사용
// import bcrypt from 'bcryptjs';

interface User {
  id: string; // Firestore 문서 ID
  displayName: string; // displayName을 필수 로그인 ID로 사용
  role: 'user' | 'admin';
}

interface AuthContextType {
  user: User | null;
  login: (displayName: string, password: string) => Promise<boolean>; // displayName으로 변경
  logout: () => void; // 동기로 변경 (localStorage만 처리)
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 컴포넌트 마운트 시 localStorage에서 사용자 정보 로드
    try {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
    } catch (error) {
      console.error("Error loading user from localStorage:", error);
      localStorage.removeItem('user'); // 손상된 데이터 제거
    }
    setLoading(false);
  }, []);

  const login = async (displayName: string, password: string): Promise<boolean> => {
    setLoading(true);
    try {
      const usersRef = collection(db, 'users');
      // displayName으로 사용자 검색 (대소문자 구분)
      // 실제로는 대소문자 구분 없이 검색하거나, displayName을 저장할 때 정규화하는 것이 좋음
      const q = query(usersRef, where('displayName', '==', displayName));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        console.log('User not found with displayName:', displayName);
        setLoading(false);
        return false;
      }

      // displayName이 고유하다고 가정 (실제로는 중복될 수 있으므로 추가 처리 필요)
      // 여기서는 첫 번째 검색된 사용자를 사용
      const userData = querySnapshot.docs[0].data() as DocumentData;
      const userId = querySnapshot.docs[0].id;

      // 중요: 실제 프로덕션에서는 해시된 비밀번호를 비교해야 합니다.
      if (userData.password === password) { // userData.password는 Firestore에 저장된 (해시되지 않은) 비밀번호
        const loggedInUser: User = {
          id: userId,
          displayName: userData.displayName, // Firestore에 저장된 displayName
          role: userData.role || 'user',
        };
        setUser(loggedInUser);
        localStorage.setItem('user', JSON.stringify(loggedInUser));
        setLoading(false);
        return true;
      } else {
        console.log('Incorrect password for displayName:', displayName);
        setLoading(false);
        return false;
      }
    } catch (error) {
      console.error("Login error:", error);
      setLoading(false);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    // 필요하다면 /login 페이지로 리다이렉트
  };

  const value = {
    user,
    login,
    logout,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
