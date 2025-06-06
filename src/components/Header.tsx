import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, Menu, X } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import logoUrl from '@/assets/images/logo.png';

const Header = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setIsMobileMenuOpen(false);
    navigate('/');
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <header className="bg-white shadow-md border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <Link to="/dashboard" className="flex items-center space-x-3" onClick={() => setIsMobileMenuOpen(false)}>
            <img src={logoUrl} alt="logo" className="w-20 h-10 rounded-lg object-contain" />
            <div>
              <h1 className="text-xl font-google font-semibold text-gray-900">GDG on Campus Gachon</h1>
              <p className="text-sm text-google-grey">Coffee Chat Reservation System</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                {/* <span className="text-sm text-gray-700 font-medium">
                  안녕하세요, {user?.displayName}님
                </span> */}
                {user?.role === 'admin' && (
                  <Link to="/admin">
                    <Button variant="outline" size="sm">
                      관리자 대시보드
                    </Button>
                  </Link>
                )}
                <Link to="/dashboard">
                  <Button variant="outline" size="sm">
                    대시보드
                  </Button>
                </Link>
                <Button onClick={handleLogout} variant="ghost" size="sm">
                  <LogOut className="w-4 h-4 mr-2" />
                  로그아웃
                </Button>
              </>
            ) : (
              <Link to="/">
                <Button className="bg-google-blue hover:bg-blue-600">
                  로그인
                </Button>
              </Link>
            )}
          </nav>

          <div className="md:hidden">
            <Button onClick={toggleMobileMenu} variant="ghost" size="icon">
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </Button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <nav className="md:hidden py-4 border-t border-gray-200">
            {isAuthenticated ? (
              <div className="flex flex-col space-y-2">
                {/* <span className="text-sm text-gray-700 font-medium px-3 py-2">
                  안녕하세요, {user?.displayName}님
                </span> */}
                {user?.role === 'admin' && (
                  <Link to="/admin" onClick={toggleMobileMenu}>
                    <Button variant="ghost" className="w-full justify-start">
                      관리자 대시보드
                    </Button>
                  </Link>
                )}
                <Link to="/dashboard" onClick={toggleMobileMenu}>
                  <Button variant="ghost" className="w-full justify-start">
                    대시보드
                  </Button>
                </Link>
                <Button onClick={handleLogout} variant="ghost" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50">
                  <LogOut className="w-4 h-4 mr-2" />
                  로그아웃
                </Button>
              </div>
            ) : (
              <Link to="/" onClick={toggleMobileMenu}>
                <Button className="w-full bg-google-blue hover:bg-blue-600">
                  로그인
                </Button>
              </Link>
            )}
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;
