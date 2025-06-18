import { useAuth } from '@/contexts/AuthContext';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, Coffee, ArrowLeft, MapPin, Loader2, Edit3, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy, doc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/components/ui/use-toast';

interface Booking {
  id: string;
  date: string; 
  time: string; 
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed';
  userId: string;
  userName?: string;
  userPhone?: string;
  location?: string;
  hostName?: string;
}

const MyBookings = () => {
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [pastBookings, setPastBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchBookings = async () => {
      setLoading(true);
      try {
        const bookingsRef = collection(db, 'bookings');
        const q = query(
          bookingsRef,
          where('userId', '==', user.id),
          orderBy('date', 'desc'),
          orderBy('time', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const fetchedBookings = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
        setAllBookings(fetchedBookings);
      } catch (error) {
        console.error("Error fetching bookings:", error);
        toast({
          title: "오류",
          description: "예약 정보를 가져오는 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchBookings();
  }, [user, toast]);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const currentUpcoming = allBookings.filter(b => {
      const bookingDate = new Date(`${b.date}T${b.time}:00`);
      return bookingDate >= today && (b.status === 'confirmed' || b.status === 'pending');
    });

    const currentPast = allBookings.filter(b => {
      const bookingDate = new Date(`${b.date}T${b.time}:00`);
      return bookingDate < today || b.status === 'completed' || b.status === 'cancelled';
    });

    setUpcomingBookings(currentUpcoming.sort((a, b) => new Date(`${a.date}T${a.time}:00`).getTime() - new Date(`${b.date}T${b.time}:00`).getTime()));
    setPastBookings(currentPast);

  }, [allBookings]);

  if (!isAuthenticated && !loading) {
    return <Navigate to="/login" replace />;
  }

  const handleEditBooking = (bookingId: string) => {
    navigate(`/booking?bookingId=${bookingId}`);
  };

  const handleCancelBooking = async (bookingId: string) => {
    if (!window.confirm("정말로 이 예약을 취소하시겠습니까?")) return;

    setLoading(true);
    try {
      const bookingRef = doc(db, 'bookings', bookingId);
      await deleteDoc(bookingRef);

      setAllBookings(prevBookings => prevBookings.filter(b => b.id !== bookingId));
      toast({
        title: "성공",
        description: "예약이 취소되었습니다.",
      });
    } catch (error) {
      console.error("Error cancelling booking:", error);
      toast({
        title: "오류",
        description: "예약 취소 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'confirmed':
        return '확정';
      case 'pending':
        return '대기중';
      case 'completed':
        return '완료';
      case 'cancelled':
        return '취소됨';
      default:
        return '알 수 없음';
    }
  };

  if (loading && allBookings.length === 0) {
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
      
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-google font-bold text-gray-900 mb-2">
              내 예약 관리
            </h1>
            <p className="text-lg text-gray-600">
              커피챗 예약 내역을 확인하고 관리하세요.
            </p>
          </div>
          <div className="flex space-x-3">
            <Link to="/dashboard">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                대시보드로
              </Button>
            </Link>
            <Link to="/booking">
              <Button className="bg-google-blue hover:bg-blue-600">
                <Calendar className="w-4 h-4 mr-2" />
                새 예약
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Upcoming Bookings */}
            <div>
              <h2 className="text-xl font-google font-semibold text-gray-900 mb-4">
                다가오는 커피챗 ({upcomingBookings.length})
              </h2>
              
              {upcomingBookings.length > 0 ? (
                <div className="space-y-4">
                  {upcomingBookings.map((booking) => (
                    <Card key={booking.id} className="animate-fade-in hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-google-blue/10 rounded-lg flex items-center justify-center">
                              <Coffee className="w-6 h-6 text-google-blue" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-gray-900">
                                {format(new Date(booking.date), 'PPP', { locale: ko })}
                              </h3>
                              <p className="text-sm text-gray-600 flex items-center">
                                <Clock className="w-4 h-4 mr-1" />
                                {booking.time} (30분)
                              </p>
                            </div>
                          </div>
                          <Badge className={getStatusColor(booking.status)}>
                            {getStatusText(booking.status)}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div className="flex items-center text-sm text-gray-600">
                            <MapPin className="w-4 h-4 mr-2" />
                            <a 
                              href="https://naver.me/xCB7C3ew" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-google-blue hover:text-blue-600 hover:underline cursor-pointer"
                            >
                              {booking.location || '구글스타트업캠퍼스 서울'}
                            </a>
                          </div>
                          <div className="text-sm text-gray-600">
                            <strong>주최자:</strong> {booking.hostName || '장영하'}
                          </div>
                        </div>

                        <div className="flex justify-end space-x-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditBooking(booking.id)} disabled={loading}>
                            <Edit3 className="w-3 h-3 mr-1.5" />
                            수정
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                            onClick={() => handleCancelBooking(booking.id)}
                            disabled={loading || booking.status === 'cancelled' || booking.status === 'completed'}
                          >
                            <XCircle className="w-3 h-3 mr-1.5" />
                            취소
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Coffee className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      예정된 커피챗이 없습니다
                    </h3>
                    <p className="text-gray-600 mb-4">
                      새로운 커피챗을 예약해보세요!
                    </p>
                    <Link to="/booking">
                      <Button className="bg-google-blue hover:bg-blue-600">
                        커피챗 예약하기
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Past Bookings */}
            <div>
              <h2 className="text-xl font-google font-semibold text-gray-900 mb-4">
                지난 커피챗 ({pastBookings.length})
              </h2>
              
              <div className="space-y-4">
                {pastBookings.map((booking) => (
                  <Card key={booking.id} className="animate-fade-in opacity-75">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                            <Coffee className="w-6 h-6 text-gray-400" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-700">
                              {format(new Date(booking.date), 'PPP', { locale: ko })}
                            </h3>
                            <p className="text-sm text-gray-500 flex items-center">
                              <Clock className="w-4 h-4 mr-1" />
                              {booking.time}
                            </p>
                          </div>
                        </div>
                        <Badge className={getStatusColor(booking.status)}>
                          {getStatusText(booking.status)}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center text-sm text-gray-500">
                          <MapPin className="w-4 h-4 mr-2" />
                          <a 
                            href="https://naver.me/xCB7C3ew" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-google-blue hover:text-blue-600 hover:underline cursor-pointer"
                          >
                            {booking.location || '구글스타트업캠퍼스 서울'}
                          </a>
                        </div>
                        <div className="text-sm text-gray-500">
                          <strong>주최자:</strong> {booking.hostName || '장영하'}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 space-y-6">
              {/* Quick Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">예약 현황</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">총 예약 수</span>
                    <span className="font-semibold">{allBookings.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">다가오는 예약</span>
                    <span className="font-semibold text-google-blue">{upcomingBookings.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">완료된 커피챗</span>
                    <span className="font-semibold text-google-green">
                      {allBookings.filter(b => b.status === 'completed').length}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">빠른 작업</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Link to="/booking" className="block">
                    <Button className="w-full bg-google-blue hover:bg-blue-600">
                      새 커피챗 예약
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {/* Tips */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">💡 팁</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>• 예약 시간 5분 전에 도착해주세요</li>
                    <li>• 궁금한 점을 미리 정리해오시면 좋습니다</li>
                    <li>• 편안한 마음으로 대화를 나누세요</li>
                    <li>• 피드백은 서로의 성장에 도움이 됩니다</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyBookings;
