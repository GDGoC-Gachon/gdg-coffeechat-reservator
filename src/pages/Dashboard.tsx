import { useAuth } from '@/contexts/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import Header from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, Coffee, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Booking {
  id: string;
  date: string; // 'YYYY-MM-DD' 형식
  time: string; // 'HH:MM' 형식
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed'; // 'completed' 상태 추가
  userId: string;
  userName?: string; // 예약자 이름 (옵셔널)
  userPhone?: string; // 예약자 전화번호 (옵셔널)
  // 필요에 따라 다른 필드 추가 가능 (예: coffeeShop, notes 등)
}

const Dashboard = () => {
  const { isAuthenticated, user } = useAuth();
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [stats, setStats] = useState([
    { title: '총 예약 수', value: '0', icon: Calendar, color: 'text-google-blue' },
    { title: '이번 주 예약', value: '0', icon: Clock, color: 'text-google-green' },
    { title: '완료된 커피챗', value: '0', icon: Coffee, color: 'text-google-yellow' },
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchBookings = async () => {
      setLoading(true);
      try {
        // Fetch upcoming bookings
        const bookingsRef = collection(db, 'bookings');
        const today = new Date();
        today.setHours(0, 0, 0, 0); // 오늘 날짜의 시작

        const upcomingQuery = query(
          bookingsRef,
          where('userId', '==', user.id),
          where('date', '>=', today.toISOString().split('T')[0]), // 오늘 이후 날짜
          orderBy('date'),
          orderBy('time')
        );
        const upcomingSnapshot = await getDocs(upcomingQuery);
        const fetchedUpcomingBookings = upcomingSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking))
          .filter(booking => {
            // 'YYYY-MM-DD HH:MM' 형식의 문자열을 Date 객체로 변환
            const bookingDateTime = new Date(`${booking.date}T${booking.time}:00`);
            return bookingDateTime >= today && (booking.status === 'confirmed' || booking.status === 'pending');
          });
        setUpcomingBookings(fetchedUpcomingBookings);

        // Fetch all bookings for stats calculation
        const allBookingsQuery = query(bookingsRef, where('userId', '==', user.id));
        const allBookingsSnapshot = await getDocs(allBookingsQuery);
        const allUserBookings = allBookingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));

        // Calculate stats
        const totalBookings = allUserBookings.length;

        const todayMs = new Date().getTime();
        const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
        const startOfWeek = new Date(todayMs - (new Date().getDay() * oneWeekMs / 7)); // 이번 주의 시작 (일요일)
        startOfWeek.setHours(0,0,0,0);
        const endOfWeek = new Date(startOfWeek.getTime() + oneWeekMs -1); // 이번 주의 끝 (토요일)
        endOfWeek.setHours(23,59,59,999);


        const bookingsThisWeek = allUserBookings.filter(booking => {
          const bookingDate = new Date(booking.date);
          return bookingDate >= startOfWeek && bookingDate <= endOfWeek;
        }).length;

        const completedBookings = allUserBookings.filter(
          booking => booking.status === 'completed' || (booking.status === 'confirmed' && new Date(`${booking.date}T${booking.time}:00`) < new Date())
        ).length;

        setStats([
          { title: '총 예약 수', value: totalBookings.toString(), icon: Calendar, color: 'text-google-blue' },
          { title: '이번 주 예약', value: bookingsThisWeek.toString(), icon: Clock, color: 'text-google-green' },
          { title: '완료된 커피챗', value: completedBookings.toString(), icon: Coffee, color: 'text-google-yellow' },
        ]);

      } catch (error) {
        console.error("Error fetching bookings:", error);
        // TODO: Show error toast to user
      } finally {
        setLoading(false);
      }
    };

    fetchBookings();
  }, [user]);

  if (!isAuthenticated && !loading) { // 로딩 중이 아닐 때만 리다이렉트
    return <Navigate to="/login" replace />;
  }

  // 로딩 중 UI
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <div className="flex-grow flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-google-blue animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-google font-bold text-gray-900 mb-2">
            안녕하세요, {user?.displayName}님! 👋
          </h1>
          <p className="text-lg text-gray-600">
            대시보드에서 커피챗 예약을 관리하세요.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {stats.map((stat, index) => (
            <Card key={index} className="animate-scale-in">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                    <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-full bg-gray-100`}>
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Quick Actions */}
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="w-5 h-5 mr-2 text-google-blue" />
                빠른 작업
              </CardTitle>
              <CardDescription>
                자주 사용하는 기능들에 빠르게 접근하세요.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link to="/booking" className="block">
                <Button className="w-full justify-start bg-google-blue hover:bg-blue-600">
                  <Calendar className="w-4 h-4 mr-2" />
                  새 커피챗 예약
                </Button>
              </Link>
              <Link to="/my-bookings" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Clock className="w-4 h-4 mr-2" />
                  내 예약 관리
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Upcoming Bookings */}
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Coffee className="w-5 h-5 mr-2 text-google-green" />
                다가오는 커피챗
              </CardTitle>
              <CardDescription>
                예정된 커피챗 일정을 확인하세요.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingBookings.length > 0 ? (
                <div className="space-y-3">
                  {upcomingBookings.map((booking) => (
                    <div key={booking.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div>
                        <p className="font-medium text-gray-900">
                          {new Date(booking.date).toLocaleDateString('ko-KR', {
                            month: 'long',
                            day: 'numeric',
                            weekday: 'short'
                          })}
                        </p>
                        <p className="text-sm text-gray-600">{booking.time}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        booking.status === 'confirmed' 
                          ? 'bg-green-100 text-green-800' 
                          : booking.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800' // cancelled or other statuses
                      }`}>
                        {booking.status === 'confirmed' ? '확정' : booking.status === 'pending' ? '대기중' : booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Coffee className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">예정된 커피챗이 없습니다.</p>
                  <Link to="/booking">
                    <Button className="mt-3 bg-google-blue hover:bg-blue-600">
                      커피챗 예약하기
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
