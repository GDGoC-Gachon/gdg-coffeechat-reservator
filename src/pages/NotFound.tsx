import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import Header from '@/components/Header';

const NotFound = () => {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Header />
      <main className="flex-grow flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-lg shadow-xl max-w-md w-full animate-fade-in">
          <h1 className="text-9xl font-bold text-google-blue">404</h1>
          <h2 className="text-3xl font-semibold text-gray-800 mt-4">페이지를 찾을 수 없습니다.</h2>
          <p className="text-gray-600 mt-2">
            죄송합니다. 요청하신 페이지가 존재하지 않거나, 현재 사용할 수 없습니다.
          </p>
          <div className="mt-8">
            <Button asChild>
              <Link to="/">홈으로 돌아가기</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
