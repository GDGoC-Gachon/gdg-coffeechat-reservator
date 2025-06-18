import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import Header from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, Users, Coffee, Settings, Plus, Search, UserPlus, Trash2, Edit3, Briefcase, Clock, CheckCircle, XCircle, CalendarPlus, CalendarCheck, CalendarX, 
  Save as SaveIcon, 
  PlusCircle as PlusCircleIcon 
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { useState, useEffect, useMemo } from 'react';
import { format, startOfWeek, endOfWeek, isWithinInterval, parse, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, doc, deleteDoc, updateDoc, DocumentData, Timestamp, query, orderBy, where, writeBatch, setDoc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar as CalendarIconUi } from '@/components/ui/calendar';
import { Switch } from "@/components/ui/switch";

interface DashboardUser {
  id: string;
  displayName: string;
  role: 'user' | 'admin';
  createdAt?: Timestamp;
}

interface Booking {
  id: string;
  userId: string; 
  userName: string; 
  userPhone?: string;
  hostId?: string;
  hostName?: string;
  location?: string;
  date: string;
  time: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
  title?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

interface BookingFormState {
  id?: string;
  userId?: string;
  userName?: string;
  userPhone?: string;
  hostId?: string;
  hostName?: string;
  location?: string;
  date?: string;
  time?: string;
  status?: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
  title?: string;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'confirmed': return 'bg-green-100 text-green-800';
    case 'pending': return 'bg-yellow-100 text-yellow-800';
    case 'completed': return 'bg-blue-100 text-blue-800';
    case 'cancelled': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'confirmed': return '확정됨';
    case 'pending': return '승인대기';
    case 'completed': return '완료됨';
    case 'cancelled': return '취소됨';
    default: return '알 수 없음';
  }
};

// Firestore collection name for available time slots by date
const AVAILABLE_TIME_SLOTS_COLLECTION = 'availableTimeSlots';

// Helper function to generate all 30-min slots for a day (e.g., 09:00 to 22:30)
const generateAllPossibleTimeSlotsForDay = (startHour = 9, endHour = 23): string[] => {
  const slots: string[] = [];
  for (let hour = startHour; hour < endHour; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    slots.push(`${String(hour).padStart(2, '0')}:30`);
  }
  return slots;
};

const AdminDashboard = () => {
  const { isAuthenticated, isAdmin, user: adminUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);

  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [bookingFormData, setBookingFormData] = useState<BookingFormState>({});
  const [availableUsers, setAvailableUsers] = useState<DashboardUser[]>([]);
  const [availableHosts, setAvailableHosts] = useState<DashboardUser[]>([]);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);

  const [newUserDisplayName, setNewUserDisplayName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'user' | 'admin'>('user');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<DashboardUser | null>(null);
  const [editUserDisplayName, setEditUserDisplayName] = useState('');
  const [editUserRole, setEditUserRole] = useState<'user' | 'admin'>('user');
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  // --- 새로운 날짜별 시간 슬롯 관리 상태들 ---
  const [selectedDateForSlots, setSelectedDateForSlots] = useState<Date | undefined>(new Date());
  const [timeSlotsForSelectedDate, setTimeSlotsForSelectedDate] = useState<string[]>([]); // Firestore에 저장된 슬롯
  const [editableTimeSlotsForSelectedDate, setEditableTimeSlotsForSelectedDate] = useState<string[]>([]); // UI에서 편집 중인 슬롯
  const [isLoadingSelectedDateSlots, setIsLoadingSelectedDateSlots] = useState(false);
  const [isSavingSelectedDateSlots, setIsSavingSelectedDateSlots] = useState(false);
  
  const allPossibleSlots = useMemo(() => generateAllPossibleTimeSlotsForDay(), []);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;

    const fetchUsersAndBookings = async () => {
      setIsLoadingUsers(true);
      setIsLoadingBookings(true);
      try {
        const usersCollectionRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersCollectionRef);
        const usersList = usersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as DashboardUser));
        setUsers(usersList);
        setAvailableUsers(usersList.filter(u => u.role === 'user'));
        setAvailableHosts(usersList.filter(u => u.role === 'admin'));

        const bookingsCollectionRef = collection(db, 'bookings');
        const bookingsQuery = query(bookingsCollectionRef, orderBy('date', 'desc'), orderBy('time', 'desc'));
        const bookingsSnapshot = await getDocs(bookingsQuery);
        const bookingsList = bookingsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            userId: data.userId,
            userName: data.userName,
            userPhone: data.userPhone,
            hostId: data.hostId,
            hostName: data.hostName,
            location: data.location,
            status: data.status,
            notes: data.notes,
            title: data.title,
            date: data.date,
            time: data.time,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          } as Booking;
        });
        setBookings(bookingsList);

      } catch (error) {
        console.error("Error fetching data:", error);
        toast({ title: "데이터 로딩 오류", description: "사용자 또는 예약 목록을 불러오는 데 실패했습니다.", variant: "destructive" });
      }
      setIsLoadingUsers(false);
      setIsLoadingBookings(false);
    };

    fetchUsersAndBookings();
  }, [isAuthenticated, isAdmin, toast]);

  // --- 날짜별 시간 슬롯 로딩 함수 (기존 fetchAdminTimeSlots 수정) ---
  const fetchSlotsForDate = async (date: Date) => {
    setIsLoadingSelectedDateSlots(true);
    const dateString = format(date, 'yyyy-MM-dd');
    const docRef = doc(db, AVAILABLE_TIME_SLOTS_COLLECTION, dateString);
    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data()?.slots) {
        const fetchedSlots = docSnap.data()?.slots;
        if (Array.isArray(fetchedSlots) && fetchedSlots.every(s => typeof s === 'string')) {
          const sortedSlots = [...fetchedSlots].sort();
          setTimeSlotsForSelectedDate(sortedSlots);
          setEditableTimeSlotsForSelectedDate(sortedSlots);
        } else {
          setTimeSlotsForSelectedDate([]);
          setEditableTimeSlotsForSelectedDate([]);
          console.warn(`Time slots data for ${dateString} is not in expected format:`, fetchedSlots);
        }
      } else {
        setTimeSlotsForSelectedDate([]);
        setEditableTimeSlotsForSelectedDate([]); // 해당 날짜에 설정된 슬롯 없음
      }
    } catch (error) {
      console.error(`Error fetching time slots for ${dateString}:`, error);
      toast({ title: "오류", description: `선택된 날짜 (${dateString})의 시간 슬롯 로딩 중 오류.`, variant: "destructive" });
      setTimeSlotsForSelectedDate([]);
      setEditableTimeSlotsForSelectedDate([]);
    } finally {
      setIsLoadingSelectedDateSlots(false);
    }
  };

  useEffect(() => {
    if (selectedDateForSlots && isAuthenticated && isAdmin) {
      fetchSlotsForDate(selectedDateForSlots);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateForSlots, isAuthenticated, isAdmin]); // toast는 fetchSlotsForDate 내부에서 사용

  const stats = useMemo(() => {
    const today = new Date();
    const startOfThisWeek = startOfWeek(today, { locale: ko });
    const endOfThisWeek = endOfWeek(today, { locale: ko });

    const upcomingBookingsThisWeek = bookings.filter(b => {
      const bookingDateTime = parse(`${b.date} ${b.time}`, 'yyyy-MM-dd HH:mm', new Date());
      return (
        b.status === 'confirmed' &&
        isValid(bookingDateTime) &&
        isWithinInterval(bookingDateTime, { start: today, end: endOfThisWeek })
      );
    }).length;

    const completedBookings = bookings.filter(b => b.status === 'completed').length;
    const pendingBookings = bookings.filter(b => b.status === 'pending').length;

    return [
      { title: '총 사용자', value: users.length.toString(), icon: Users, changeType: 'neutral' },
      { title: '이번 주 확정 예약', value: upcomingBookingsThisWeek.toString(), icon: CalendarCheck, changeType: 'positive' },
      { title: '완료된 커피챗', value: completedBookings.toString(), icon: CheckCircle, changeType: 'positive' },
      { title: '승인 대기중 예약', value: pendingBookings.toString(), icon: Clock, changeType: 'warning' }
    ];
  }, [users, bookings]);

  const filteredBookings = useMemo(() => {
    if (!searchTerm) return bookings;
    return bookings.filter(booking =>
      (booking.userName?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (booking.hostName?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (booking.title?.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [bookings, searchTerm]);

  const hasChangesForSelectedDate = useMemo(() => 
    JSON.stringify(timeSlotsForSelectedDate.sort()) !== JSON.stringify(editableTimeSlotsForSelectedDate.sort()),
    [timeSlotsForSelectedDate, editableTimeSlotsForSelectedDate]
  );

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[handleAddUser] Function called");
    console.log("[handleAddUser] Current form values:", { newUserDisplayName, newUserPassword, newUserRole });

    if (!newUserDisplayName || !newUserPassword) {
      toast({ title: "입력 오류", description: "이름과 비밀번호는 필수 항목입니다.", variant: "destructive" });
      console.warn("[handleAddUser] Validation Error: DisplayName or Password missing");
      return;
    }
    if (users.some(user => user.displayName === newUserDisplayName)) {
      toast({ title: "입력 오류", description: "이미 사용 중인 이름입니다. 다른 이름을 입력해주세요.", variant: "destructive" });
      console.warn("[handleAddUser] Validation Error: DisplayName already exists");
      return;
    }

    setIsAddingUser(true);
    console.log("[handleAddUser] Submitting state set to true. Attempting to add user to Firestore.");
    try {
      const usersCollectionRef = collection(db, 'users');
      const userData = {
        displayName: newUserDisplayName,
        password: newUserPassword, // 주의: 실제 운영에서는 해싱 필요
        role: newUserRole,
        createdAt: Timestamp.now(),
      };
      console.log("[handleAddUser] Data to be added to Firestore:", userData);

      const docRef = await addDoc(usersCollectionRef, userData);
      console.log("[handleAddUser] User added to Firestore with ID:", docRef.id);

      toast({ title: "성공", description: "새로운 사용자가 추가되었습니다." });
      
      // 폼 초기화
      setNewUserDisplayName('');
      setNewUserPassword('');
      setNewUserRole('user');
      console.log("[handleAddUser] Form reset.");

      // 사용자 목록 새로고침 (현재 방식)
      console.log("[handleAddUser] Refreshing user list from Firestore...");
      const querySnapshot = await getDocs(usersCollectionRef);
      const usersList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DashboardUser));
      setUsers(usersList);
      console.log("[handleAddUser] User list refreshed. New count:", usersList.length);

    } catch (error) {
      console.error("[handleAddUser] Error adding user to Firestore:", error);
      let errorMessage = "사용자 추가에 실패했습니다. 콘솔 로그를 확인해주세요.";
      if (error instanceof Error && 'code' in error) { // Firestore 에러인 경우 좀 더 구체적인 정보 제공 가능
        const firestoreError = error as { code: string, message: string };
        errorMessage = `오류 코드: ${firestoreError.code}. ${firestoreError.message}`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast({ title: "오류", description: errorMessage, variant: "destructive" });
    } finally {
      setIsAddingUser(false);
      console.log("[handleAddUser] Submitting state set to false.");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === adminUser?.id) {
        toast({ title: "오류", description: "자기 자신은 삭제할 수 없습니다.", variant: "destructive" });
        return;
    }
    if (window.confirm("정말로 이 사용자를 삭제하시겠습니까?")) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        toast({ title: "성공", description: "사용자가 삭제되었습니다." });
        setUsers(users.filter(user => user.id !== userId));
      } catch (error) {
        console.error("Error deleting user:", error);
        toast({ title: "오류", description: "사용자 삭제에 실패했습니다.", variant: "destructive" });
      }
    }
  };
  
  const handleEditUser = (user: DashboardUser) => {
    setEditingUser(user);
    setEditUserDisplayName(user.displayName);
    setEditUserRole(user.role);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!editUserDisplayName) {
      toast({ title: "입력 오류", description: "이름은 필수 항목입니다.", variant: "destructive" });
      return;
    }
    if (users.some(user => user.id !== editingUser.id && user.displayName === editUserDisplayName)) {
      toast({ title: "입력 오류", description: "이미 사용 중인 이름입니다. 다른 이름을 입력해주세요.", variant: "destructive" });
      return;
    }

    setIsUpdatingUser(true);
    try {
      const userDocRef = doc(db, 'users', editingUser.id);
      await updateDoc(userDocRef, {
        displayName: editUserDisplayName,
        role: editUserRole,
      });
      toast({ title: "성공", description: "사용자 정보가 업데이트되었습니다." });
      setUsers(users.map(u => u.id === editingUser.id ? { ...u, displayName: editUserDisplayName, role: editUserRole } : u));
      setEditingUser(null);
      setEditUserDisplayName('');
      setEditUserRole('user');
    } catch (error) {
      console.error("Error updating user:", error);
      toast({ title: "오류", description: "사용자 정보 업데이트에 실패했습니다.", variant: "destructive" });
    }
    setIsUpdatingUser(false);
  };

  const handleOpenBookingModal = (booking?: Booking) => {
    if (booking) {
      setEditingBooking(booking);
      setBookingFormData({
        id: booking.id,
        userId: booking.userId,
        userName: booking.userName,
        userPhone: booking.userPhone,
        hostId: booking.hostId,
        hostName: booking.hostName,
        status: booking.status,
        notes: booking.notes,
        title: booking.title,
        date: booking.date,
        time: booking.time,
      });
    } else {
      setEditingBooking(null);
      setBookingFormData({ 
        status: 'pending', 
        date: format(new Date(), "yyyy-MM-dd"),
        time: format(new Date(), "HH:mm"),
        hostId: adminUser?.id,
        hostName: adminUser?.displayName,
      });
    }
    setIsBookingModalOpen(true);
  };

  const handleBookingFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setBookingFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleBookingUserChange = (userId: string) => {
    const selectedUser = availableUsers.find(u => u.id === userId);
    setBookingFormData(prev => ({ ...prev, userId, userName: selectedUser?.displayName }));
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingBooking(true);

    const { userId, userName, userPhone, hostId, hostName, location, date: formDateStr, time: formTimeStr, status: formStatus, notes, title } = bookingFormData;

    if (!userId || !formDateStr || !formTimeStr || !formStatus) {
      toast({ title: "입력 오류", description: "예약자, 예약 날짜, 시간, 상태를 올바르게 입력해주세요.", variant: "destructive" });
      setIsSubmittingBooking(false);
      return;
    }

    const dataToSave = {
      userId: userId,
      userName: userName || users.find(u => u.id === userId)?.displayName || '알 수 없는 사용자',
      userPhone: userPhone || '',
      hostId: hostId || adminUser?.id,
      hostName: hostName || '장영하',
      location: location || '구글스타트업캠퍼스 서울',
      status: formStatus,
      notes: notes || '',
      title: title || '커피챗 세션',
      date: formDateStr, // string
      time: formTimeStr, // string
      // createdAt and updatedAt will be Timestamps
    };

    try {
      if (editingBooking) {
        const payloadForUpdate = {
          ...dataToSave,
          updatedAt: Timestamp.now(), // Firestore Timestamp
        };
        // Ensure createdAt is not part of payload if it's not meant to be updated
        // const { createdAt, ...updateData } = payloadForUpdate; // This might be safer if createdAt should never change on update

        await updateDoc(doc(db, 'bookings', editingBooking.id), payloadForUpdate);
        toast({ title: "성공", description: "예약 정보가 수정되었습니다." });

        setBookings(currentBookings =>
          currentBookings.map(b =>
            b.id === editingBooking.id
              ? {
                  ...b, // Preserve existing fields like createdAt
                  ...payloadForUpdate, // Apply all updated fields
                }
              : b
          )
        );
      } else { // Adding new booking
        const payloadForAdd = {
          ...dataToSave,
          createdAt: Timestamp.now(), // Firestore Timestamp
        };
        const newDocRef = await addDoc(collection(db, 'bookings'), payloadForAdd);
        toast({ title: "성공", description: "새로운 예약이 추가되었습니다." });

        const newBookingEntry: Booking = {
          id: newDocRef.id,
          userId: payloadForAdd.userId,
          userName: payloadForAdd.userName,
          userPhone: payloadForAdd.userPhone,
          hostId: payloadForAdd.hostId,
          hostName: payloadForAdd.hostName,
          location: payloadForAdd.location,
          status: payloadForAdd.status,
          notes: payloadForAdd.notes,
          title: payloadForAdd.title,
          date: payloadForAdd.date, // string
          time: payloadForAdd.time, // string
          createdAt: payloadForAdd.createdAt, // Timestamp
          // updatedAt will be undefined here
        };

        setBookings(prevBookings =>
          [...prevBookings, newBookingEntry].sort((a, b) => {
            const dateTimeStrA = `${a.date} ${a.time}`;
            const dateTimeStrB = `${b.date} ${b.time}`;
            // Sort descending (most recent first)
            if (dateTimeStrA < dateTimeStrB) return 1;
            if (dateTimeStrA > dateTimeStrB) return -1;
            return 0;
          })
        );
      }
      setIsBookingModalOpen(false);
      setEditingBooking(null);
      setBookingFormData({});
    } catch (error) {
      console.error("Error submitting booking:", error);
      toast({ title: "예약 처리 오류", description: "예약 정보를 저장하는 중 오류가 발생했습니다.", variant: "destructive" });
    }
    setIsSubmittingBooking(false);
  };

  const handleDeleteBooking = async (bookingId: string) => {
    if (window.confirm("정말로 이 예약을 삭제하시겠습니까?")) {
      try {
        await deleteDoc(doc(db, 'bookings', bookingId));
        toast({ title: "성공", description: "예약이 삭제되었습니다." });
        setBookings(bookings.filter(b => b.id !== bookingId));
      } catch (error) {
        console.error("Error deleting booking:", error);
        toast({ title: "오류", description: "예약 삭제에 실패했습니다.", variant: "destructive" });
      }
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, newStatus: Booking['status']) => {
    try {
      const bookingDocRef = doc(db, 'bookings', bookingId);
      await updateDoc(bookingDocRef, { status: newStatus });
      setBookings(bookings.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
      toast({ title: "성공", description: `예약 상태가 ${getStatusText(newStatus)}로 변경되었습니다.` });
    } catch (error) {
      console.error("Error updating booking status:", error);
      toast({ title: "오류", description: "예약 상태 변경에 실패했습니다.", variant: "destructive" });
    }
  };

  // --- 날짜별 시간 슬롯 편집 및 저장 핸들러 (기존 시간 슬롯 핸들러 수정) ---
  const handleToggleTimeSlot = (slotToToggle: string) => {
    setEditableTimeSlotsForSelectedDate(prevSlots => {
      const newSlots = prevSlots.includes(slotToToggle)
        ? prevSlots.filter(s => s !== slotToToggle)
        : [...prevSlots, slotToToggle];
      return newSlots.sort();
    });
  };

  const handleSaveChangesForSelectedDate = async () => {
    if (!selectedDateForSlots) {
      toast({ title: "오류", description: "날짜가 선택되지 않았습니다.", variant: "destructive" });
      return;
    }
    setIsSavingSelectedDateSlots(true);
    const dateString = format(selectedDateForSlots, 'yyyy-MM-dd');
    const docRef = doc(db, AVAILABLE_TIME_SLOTS_COLLECTION, dateString);
    try {
      // 문서가 없으면 생성, 있으면 slots 필드를 덮어씀
      await setDoc(docRef, { slots: editableTimeSlotsForSelectedDate }); 
      setTimeSlotsForSelectedDate([...editableTimeSlotsForSelectedDate]); // 저장된 변경사항 반영
      toast({ title: "저장 완료", description: `${dateString}의 예약 가능 시간이 업데이트되었습니다.` });
    } catch (error) {
      console.error(`Error saving time slots for ${dateString}:`, error);
      toast({ title: "저장 실패", description: "변경사항 저장 중 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setIsSavingSelectedDateSlots(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <main className="p-4 sm:p-6 lg:p-8 space-y-6">
        <h1 className="text-3xl font-bold text-gray-800">관리자 대시보드</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <Card key={index} className="animate-scale-in">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                    <div className="flex items-center space-x-2">
                      <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                    </div>
                  </div>
                  <div className={`p-3 rounded-full ${stat.changeType === 'positive' ? 'bg-green-100' : stat.changeType === 'warning' ? 'bg-yellow-100' : 'bg-blue-100'}`}>
                    <stat.icon className={`w-6 h-6 ${stat.changeType === 'positive' ? 'text-green-600' : stat.changeType === 'warning' ? 'text-yellow-600' : 'text-blue-600'}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* --- 예약 가능 시간 관리 (날짜별) 섹션 --- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">날짜별 예약 가능 시간 관리</CardTitle>
            <CardDescription>캘린더에서 날짜를 선택하고, 해당 날짜에 오픈할 30분 단위 시간 슬롯을 활성화하세요.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 md:flex md:space-y-0 md:space-x-6">
            <div className="md:w-1/2 lg:w-2/5 xl:w-1/3 mx-auto md:mx-0">
              <CalendarIconUi
                mode="single"
                selected={selectedDateForSlots}
                onSelect={(date) => {
                    setSelectedDateForSlots(date);
                    // 날짜 변경 시 editable은 Firestore에서 가져온 값으로 초기화 (fetchSlotsForDate에서 처리)
                }}
                disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() -1)) } // 지난 날짜 비활성화 (선택사항)
                className="rounded-md border p-3 shadow-sm bg-white w-full" 
                locale={ko}
              />
            </div>

            <div className="md:w-1/2 lg:w-3/5 xl:w-2/3 space-y-4">
              {selectedDateForSlots && (
                <h3 className="text-lg font-medium">
                  {format(selectedDateForSlots, 'yyyy년 M월 d일 (eee)', { locale: ko })} 시간 설정
                </h3>
              )}
              {isLoadingSelectedDateSlots ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-8 h-8 text-google-blue animate-spin" />
                  <p className="ml-3 text-gray-600">선택된 날짜의 시간 정보를 불러오는 중...</p>
                </div>
              ) : selectedDateForSlots ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {allPossibleSlots.map(slot => {
                      const isActive = editableTimeSlotsForSelectedDate.includes(slot);
                      return (
                        <Button
                          key={slot}
                          variant={isActive ? "default" : "outline"}
                          onClick={() => handleToggleTimeSlot(slot)}
                          className={`w-full text-xs sm:text-sm justify-center transition-all duration-150 ${isActive ? 'bg-google-green hover:bg-green-700 text-white' : 'hover:bg-gray-100'}`}
                          disabled={isSavingSelectedDateSlots}
                        >
                          {slot}
                        </Button>
                      );
                    })}
                  </div>
                  
                  {hasChangesForSelectedDate && (
                       <Alert variant="default" className="border-yellow-400 bg-yellow-50 p-3 mt-4">
                          <AlertDescription className="text-yellow-700 text-sm">
                              선택된 날짜에 변경사항이 있습니다. 저장 버튼을 눌러 반영해주세요.
                          </AlertDescription>
                      </Alert>
                  )}

                  <div className="flex justify-end pt-4 border-t mt-4">
                    <Button 
                      onClick={handleSaveChangesForSelectedDate} 
                      disabled={isSavingSelectedDateSlots || !hasChangesForSelectedDate || !selectedDateForSlots}
                      className="bg-google-blue hover:bg-blue-700 text-white"
                    >
                      {isSavingSelectedDateSlots ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <SaveIcon className="w-4 h-4 mr-2" />
                      )}
                      {isSavingSelectedDateSlots ? '저장 중...' : '선택 날짜 시간 저장'}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 py-10 text-center">캘린더에서 날짜를 선택해주세요.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 사용자 관리 섹션 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card className="animate-fade-in">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center">
                      <Calendar className="w-5 h-5 mr-2 text-google-blue" />
                      최근 예약 관리
                    </CardTitle>
                    <CardDescription>
                      커피챗 예약을 확인하고 관리하세요.
                    </CardDescription>
                  </div>
                  <Dialog open={isBookingModalOpen} onOpenChange={setIsBookingModalOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-google-blue hover:bg-blue-600" onClick={() => handleOpenBookingModal()}>
                        <CalendarPlus className="w-4 h-4 mr-2" />
                        새 예약 추가
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[525px]">
                      <DialogHeader>
                        <DialogTitle>{editingBooking ? '예약 수정' : '새 예약 추가'}</DialogTitle>
                        <DialogDescription>{editingBooking ? `예약 정보를 수정합니다.` : `새로운 커피챗 예약을 생성합니다.`}</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleBookingSubmit} className="space-y-4 py-4">
                        <div>
                          <Label htmlFor="bookingTitle">커피챗 제목 (선택)</Label>
                          <Input id="bookingTitle" name="title" value={bookingFormData.title || ''} onChange={handleBookingFormChange} placeholder="예: 커리어 상담" />
                        </div>
                        <div>
                          <Label htmlFor="bookingUserId">예약자</Label>
                          <Select name="userId" value={bookingFormData.userId || ''} onValueChange={handleBookingUserChange} required>
                            <SelectTrigger><SelectValue placeholder="예약자를 선택하세요" /></SelectTrigger>
                            <SelectContent>
                              {availableUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.displayName}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="bookingUserPhone">예약자 전화번호</Label>
                          <Input id="bookingUserPhone" name="userPhone" type="tel" value={bookingFormData.userPhone || ''} onChange={handleBookingFormChange} placeholder="010-1234-5678" />
                        </div>
                        <div>
                          <Label htmlFor="bookingDate">예약 날짜</Label>
                          <Input id="bookingDate" name="date" type="date" value={bookingFormData.date || ''} onChange={handleBookingFormChange} required />
                        </div>
                        <div>
                          <Label htmlFor="bookingTime">예약 시간</Label>
                          <Input id="bookingTime" name="time" type="time" value={bookingFormData.time || ''} onChange={handleBookingFormChange} required />
                        </div>
                        <div>
                          <Label htmlFor="bookingStatus">예약 상태</Label>
                          <Select name="status" value={bookingFormData.status || 'pending'} onValueChange={(value) => setBookingFormData(prev => ({...prev, status: value as Booking['status']}))} required>
                            <SelectTrigger><SelectValue placeholder="상태 선택" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">승인대기</SelectItem>
                              <SelectItem value="confirmed">확정됨</SelectItem>
                              <SelectItem value="completed">완료됨</SelectItem>
                              <SelectItem value="cancelled">취소됨</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="bookingHostName">주최자 이름</Label>
                          <Input id="bookingHostName" name="hostName" value={bookingFormData.hostName || '장영하'} onChange={handleBookingFormChange} placeholder="장영하" />
                        </div>
                        <div>
                          <Label htmlFor="bookingLocation">장소</Label>
                          <Input id="bookingLocation" name="location" value={bookingFormData.location || '구글스타트업캠퍼스 서울'} onChange={handleBookingFormChange} placeholder="구글스타트업캠퍼스 서울" />
                        </div>
                        <div>
                          <Label htmlFor="bookingNotes">메모 (선택)</Label>
                          <Textarea id="bookingNotes" name="notes" value={bookingFormData.notes || ''} onChange={handleBookingFormChange} placeholder="참고 사항을 입력하세요." />
                        </div>
                        <DialogFooter>
                          <DialogClose asChild><Button type="button" variant="outline">취소</Button></DialogClose>
                          <Button type="submit" disabled={isSubmittingBooking}>{isSubmittingBooking ? (editingBooking ? '수정 중...' : '추가 중...') : (editingBooking ? '변경사항 저장' : '예약 추가')}</Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input placeholder="예약자, 주최자, 제목으로 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
                  </div>
                </div>
                {isLoadingBookings ? <p>예약 목록을 불러오는 중...</p> : filteredBookings.length === 0 ? <p>표시할 예약이 없습니다.</p> : (
                  <div className="space-y-4">
                    {filteredBookings.map((booking) => (
                      <div key={booking.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                        <div className="flex items-center space-x-4 mb-2 sm:mb-0">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getStatusColor(booking.status).replace('text-', 'bg-').replace(/\d{2,3}$/, '100')}`}>
                             {booking.status === 'confirmed' && <CalendarCheck className={`w-6 h-6 ${getStatusColor(booking.status)}`} />}
                             {booking.status === 'pending' && <Clock className={`w-6 h-6 ${getStatusColor(booking.status)}`} />}
                             {booking.status === 'completed' && <CheckCircle className={`w-6 h-6 ${getStatusColor(booking.status)}`} />}
                             {booking.status === 'cancelled' && <XCircle className={`w-6 h-6 ${getStatusColor(booking.status)}`} />}
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900 text-lg">{booking.title || '커피챗'}</h4>
                            <p className="text-sm text-gray-600">예약자: {booking.userName || booking.userId}</p>
                            {booking.userPhone && <p className="text-sm text-gray-600">전화번호: {booking.userPhone}</p>}
                            <p className="text-sm text-gray-500">주최자: {booking.hostName || booking.hostId || '미지정'}</p>
                            <p className="text-sm text-gray-500">
                              장소: 
                              <a 
                                href="https://naver.me/xCB7C3ew" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-google-blue hover:text-blue-600 hover:underline cursor-pointer ml-1"
                              >
                                {booking.location || '구글스타트업캠퍼스 서울'}
                              </a>
                            </p>
                            <p className="text-sm text-gray-500">일시: {booking.date ? format(new Date(booking.date), 'yyyy년 M월 d일', { locale: ko }) : '날짜 정보 없음'}</p>
                            {booking.notes && <p className="text-xs text-gray-400 mt-1">메모: {booking.notes}</p>}
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 mt-2 sm:mt-0">
                          <Select value={booking.status} onValueChange={(newStatus) => handleUpdateBookingStatus(booking.id, newStatus as Booking['status'])}>
                            <SelectTrigger className="w-full sm:w-auto text-xs">
                               <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="pending"><Badge className={`${getStatusColor('pending')} px-2 py-1`}>{getStatusText('pending')}</Badge></SelectItem>
                                <SelectItem value="confirmed"><Badge className={`${getStatusColor('confirmed')} px-2 py-1`}>{getStatusText('confirmed')}</Badge></SelectItem>
                                <SelectItem value="completed"><Badge className={`${getStatusColor('completed')} px-2 py-1`}>{getStatusText('completed')}</Badge></SelectItem>
                                <SelectItem value="cancelled"><Badge className={`${getStatusColor('cancelled')} px-2 py-1`}>{getStatusText('cancelled')}</Badge></SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="outline" size="sm" onClick={() => handleOpenBookingModal(booking)} className="text-xs"><Edit3 className="w-3 h-3 mr-1" />수정</Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteBooking(booking.id)} className="text-xs"><Trash2 className="w-3 h-3 mr-1" />삭제</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1 space-y-8">
            <Card className="animate-fade-in">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <UserPlus className="w-5 h-5 mr-2 text-google-green" />
                  새 사용자 추가
                </CardTitle>
                <CardDescription>새로운 사용자를 시스템에 등록합니다. (로그인은 이름/비밀번호 방식)</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <div>
                    <Label htmlFor="newUserDisplayName">이름 (로그인 ID)</Label>
                    <Input id="newUserDisplayName" type="text" value={newUserDisplayName} onChange={(e) => setNewUserDisplayName(e.target.value)} placeholder="사용자 이름" required />
                  </div>
                  <div>
                    <Label htmlFor="newUserPassword">비밀번호</Label>
                    <Input id="newUserPassword" type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} placeholder="비밀번호" required />
                  </div>
                  <div>
                    <Label htmlFor="newUserRole">역할</Label>
                    <Select value={newUserRole} onValueChange={(value: 'user' | 'admin') => setNewUserRole(value)}>
                      <SelectTrigger id="newUserRole"><SelectValue placeholder="역할 선택" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">일반 사용자 (user)</SelectItem>
                        <SelectItem value="admin">관리자 (admin)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full bg-google-green hover:bg-green-600" disabled={isAddingUser}>{isAddingUser ? '추가 중...' : '사용자 추가'}</Button>
                </form>
              </CardContent>
            </Card>

            {editingUser && (
              <Card className="animate-fade-in mt-8">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Edit3 className="w-5 h-5 mr-2 text-google-yellow" />
                    사용자 정보 수정 ({editingUser.displayName})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleUpdateUser} className="space-y-4">
                    <div>
                      <Label htmlFor="editUserDisplayName">이름</Label>
                      <Input id="editUserDisplayName" type="text" value={editUserDisplayName} onChange={(e) => setEditUserDisplayName(e.target.value)} required />
                    </div>
                    <div>
                      <Label htmlFor="editUserRole">역할</Label>
                      <Select value={editUserRole} onValueChange={(value: 'user' | 'admin') => setEditUserRole(value)}>
                        <SelectTrigger id="editUserRole"><SelectValue placeholder="역할 선택" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">일반 사용자 (user)</SelectItem>
                          <SelectItem value="admin">관리자 (admin)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex space-x-2">
                      <Button type="submit" className="w-full bg-google-yellow hover:bg-yellow-600" disabled={isUpdatingUser}>{isUpdatingUser ? '수정 중...' : '정보 수정'}</Button>
                      <Button type="button" variant="outline" onClick={() => { setEditingUser(null); setEditUserDisplayName(''); setEditUserRole('user');}} className="w-full">취소</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            <Card className="animate-fade-in">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="w-5 h-5 mr-2 text-google-purple" />
                  사용자 목록
                </CardTitle>
                <CardDescription>{users.length}명의 사용자가 등록되어 있습니다.</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingUsers ? <p>사용자 목록을 불러오는 중...</p> : users.length === 0 ? <p>등록된 사용자가 없습니다.</p> : (
                  <div className="space-y-3">
                    {users.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-3 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                        <div>
                          <p className="font-medium text-gray-800">{user.displayName}</p>
                          <div className="text-sm text-gray-600">
                            역할: <Badge variant={user.role === 'admin' ? 'destructive' : 'secondary'}>{user.role}</Badge>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditUser(user)} disabled={user.id === adminUser?.id}>
                            <Edit3 className="w-4 h-4" />
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteUser(user.id)} disabled={user.id === adminUser?.id}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
