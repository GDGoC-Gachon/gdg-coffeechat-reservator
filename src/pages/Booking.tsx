import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useNavigate, useSearchParams, Link } from 'react-router-dom';
import Header from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, Clock, CheckCircle, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { format, addDays, parseISO, isValid as isValidDate, isEqual as isEqualDate, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useToast } from '@/components/ui/use-toast';
import { collection, addDoc, doc, getDoc, updateDoc, query, where, getDocs, Timestamp, collectionGroup } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface BookingDocument {
  userId: string;
  userName: string;
  userPhone?: string;
  hostName?: string;
  location?: string;
  date: string;
  time: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

const BOOKING_PROGRESS_STORAGE_KEY = 'bookingPageProgress';

const AVAILABLE_TIME_SLOTS_COLLECTION_BOOKING = 'availableTimeSlots'; // AdminDashboard와 동일한 상수 사용 권장, 여기서는 구분 위해 임시 이름

const Booking = () => {
  // ======= ALL HOOKS (INCLUDING CUSTOM HOOKS) MUST BE CALLED AT THE TOP LEVEL =======
  // 1. Custom Hooks & Router Hooks
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Derived value from hooks (not a hook itself)
  const editingBookingId = searchParams.get('bookingId'); 

  // 2. useState HOOKS
  const [pageTitle, setPageTitle] = useState('커피챗 예약');
  const [submitButtonText, setSubmitButtonText] = useState('예약 확정 및 요청');
  const [isLoadingInitialData, setIsLoadingInitialData] = useState(!!editingBookingId);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [userPhone, setUserPhone] = useState<string>('');
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookedSlotsOnSelectedDate, setBookedSlotsOnSelectedDate] = useState<string[]>([]);
  const [loadingBookedSlots, setLoadingBookedSlots] = useState(false);
  const [originalBookingData, setOriginalBookingData] = useState<BookingDocument | null>(null);
  const [availableTimesForDay, setAvailableTimesForDay] = useState<string[]>([]);
  const [isLoadingAvailableTimes, setIsLoadingAvailableTimes] = useState(false);

  // --- 새로운 상태 변수들 ---
  const [allDatesWithSlots, setAllDatesWithSlots] = useState<string[]>([]); // 모든 예약 가능 날짜 (YYYY-MM-DD)
  const [isLoadingAllDatesInfo, setIsLoadingAllDatesInfo] = useState(true);
  const [currentCalendarViewDate, setCurrentCalendarViewDate] = useState<Date>(new Date()); // 캘린더의 현재 표시 월/연도 추적

  // 3. useMemo HOOKS
  const stepLabels = useMemo(() => ['날짜 선택', '시간 선택', '예약 확인', '완료'], []);
  
  // 4. useCallback HOOKS
  const isTimeSlotBooked = useCallback((time: string) => {
    return bookedSlotsOnSelectedDate.includes(time);
  }, [bookedSlotsOnSelectedDate]);

  const handleDateSelect = useCallback((dateFromPicker: Date | undefined) => {
    const previouslySelectedDate = selectedDate; // Stash the current selected date from state

    if (dateFromPicker) {
        // A new date is picked, or the calendar component somehow re-affirmed the selection
        setSelectedDate(dateFromPicker);
        setSelectedTime('');
        setStep(2); // Proceed to time selection
    } else {
        // dateFromPicker is undefined. This means the calendar component (react-day-picker)
        // is signalling a deselection, which typically happens when clicking an already selected date.
        if (previouslySelectedDate) {
            // If there *was* a date selected before this deselection signal,
            // it implies the user clicked on that `previouslySelectedDate`.
            // The desired behavior is to keep this date selected and proceed.
            setSelectedDate(previouslySelectedDate); // Re-set to keep it selected
            setSelectedTime(''); // Reset time selection for this date
            setStep(2); // Proceed to time selection
        } else {
            // No date was previously selected, and the picker signals undefined.
            // This is an actual deselection to an empty state.
            setSelectedDate(undefined); // Ensure date is cleared
            setSelectedTime('');
            setStep(1); // Go back to date selection step
        }
    }
  }, [selectedDate, setSelectedDate, setSelectedTime, setStep]);

  const handleTimeSelect = useCallback((time: string) => {
    setSelectedTime(time);
    if (step === 2) setStep(3);
  }, [step]);

  const handleConfirmBooking = useCallback(async () => {
    if (!selectedDate || !selectedTime || !user) {
      toast({ title: "입력 오류", description: "날짜와 시간을 모두 선택해주세요.", variant: "destructive" });
      return;
    }
    if (!userPhone.trim()) {
      toast({ title: "입력 오류", description: "전화번호를 입력해주세요.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    const payload = {
      userId: user.id,
      userName: user.displayName || 'AnonymousUser',
      userPhone: userPhone.trim(),
      hostName: '장영하',
      location: '구글스타트업캠퍼스 서울',
      date: format(selectedDate, 'yyyy-MM-dd'),
      time: selectedTime,
      updatedAt: Timestamp.now(),
    };
    try {
      if (editingBookingId && originalBookingData) {
        const bookingRef = doc(db, 'bookings', editingBookingId);
        await updateDoc(bookingRef, { ...payload, status: originalBookingData.status, createdAt: originalBookingData.createdAt });
        toast({ title: "예약 수정 완료! 🎉", description: `예약이 성공적으로 수정되었습니다.` });
        navigate('/my-bookings'); 
      } else {
        await addDoc(collection(db, 'bookings'), { ...payload, status: 'pending', createdAt: Timestamp.now() });
        toast({ title: "예약 요청 완료! 🎉", description: `예약이 요청되었습니다. 관리자 확인 후 확정됩니다.`});
        setStep(4); 
      }
      localStorage.removeItem(BOOKING_PROGRESS_STORAGE_KEY); // Clear progress on successful booking
    } catch (error) {
      console.error(`Error ${editingBookingId ? 'updating' : 'creating'} booking: `, error);
      toast({ title: "오류", description: "예약 처리 중 오류가 발생했습니다.", variant: "destructive"});
    } finally {
      setIsSubmitting(false);
    }
  }, [user, selectedDate, selectedTime, userPhone, editingBookingId, originalBookingData, navigate, toast, setStep, setIsSubmitting]);

  const resetBooking = useCallback(() => {
    setSelectedDate(undefined);
    setSelectedTime('');
    setUserPhone('');
    setBookedSlotsOnSelectedDate([]);
    setStep(1);
    localStorage.removeItem(BOOKING_PROGRESS_STORAGE_KEY); // Clear progress on reset
    if (editingBookingId) navigate('/booking', { replace: true });
  }, [editingBookingId, navigate, setStep, setSelectedDate, setSelectedTime, setUserPhone, setBookedSlotsOnSelectedDate]);

  const goToDashboard = useCallback(() => {
    navigate('/dashboard');
  }, [navigate]);

  // 5. useEffect HOOKS
  useEffect(() => {
    if (!authLoading && editingBookingId && user) {
      // Clear any new booking progress when starting an edit
      localStorage.removeItem(BOOKING_PROGRESS_STORAGE_KEY);
      setPageTitle('커피챗 예약 수정');
      setSubmitButtonText('예약 변경사항 저장');
      setIsLoadingInitialData(true);
      const fetchBookingToEdit = async () => {
        try {
          const bookingRef = doc(db, 'bookings', editingBookingId);
          const bookingSnap = await getDoc(bookingRef);
          if (bookingSnap.exists()) {
            const bookingData = { id: bookingSnap.id, ...bookingSnap.data() } as BookingDocument & {id: string};
            if (bookingData.userId !== user.id) {
              toast({ title: "권한 없음", description: "자신의 예약만 수정할 수 있습니다.", variant: "destructive" });
              navigate('/my-bookings'); return;
            }
            if (bookingData.status === 'completed' || bookingData.status === 'cancelled') {
              toast({ title: "수정 불가", description: "완료/취소된 예약은 수정 불가합니다.", variant: "destructive" });
              navigate('/my-bookings'); return;
            }
            setOriginalBookingData(bookingData);
            const dateFromDb = parseISO(bookingData.date);
            if (isValidDate(dateFromDb)) setSelectedDate(dateFromDb);
            else throw new Error("Invalid date from DB");
            setSelectedTime(bookingData.time);
            setUserPhone(bookingData.userPhone || '');
          } else {
            toast({ title: "오류", description: "수정할 예약 정보를 찾을 수 없습니다.", variant: "destructive" });
            navigate('/my-bookings');
          }
        } catch (error) {
          console.error("Error fetching booking to edit: ", error);
          toast({ title: "오류", description: "예약 정보 로딩 실패.", variant: "destructive" });
          navigate('/my-bookings');
        } finally {
          setIsLoadingInitialData(false);
        }
      };
      fetchBookingToEdit();
    } else if (!authLoading && !editingBookingId) {
      // This part is now partially handled by the localStorage loading effect for new bookings
      // We should ensure it doesn't override restored progress too eagerly or set default title if progress exists
      const savedProgressString = localStorage.getItem(BOOKING_PROGRESS_STORAGE_KEY);
      if (!savedProgressString) { // Only set defaults if no saved progress
        setPageTitle('커피챗 예약');
        setSubmitButtonText('예약 확정 및 요청');
        setOriginalBookingData(null);
      } else {
        // If progress was restored, update titles accordingly (or rely on step changes to do so)
        setPageTitle('커피챗 예약 (진행중)'); // Example title for restored progress
        setSubmitButtonText('예약 확정 및 요청');
        setOriginalBookingData(null);
      }
    }
  }, [editingBookingId, user, navigate, toast, authLoading, setPageTitle, setSubmitButtonText, setIsLoadingInitialData, setOriginalBookingData, setSelectedDate, setSelectedTime, setStep]);

  useEffect(() => {
    if (selectedDate && !authLoading && user) { // Add user to dependency array and check
      const fetchAvailableTimesForSelectedDate = async () => {
        setIsLoadingAvailableTimes(true);
        setAvailableTimesForDay([]); // 이전 날짜의 데이터를 초기화
        const dateKey = format(selectedDate, 'yyyy-MM-dd');
        try {
          const timeSlotsDocRef = doc(db, AVAILABLE_TIME_SLOTS_COLLECTION_BOOKING, dateKey);
          const docSnap = await getDoc(timeSlotsDocRef);

          if (docSnap.exists() && docSnap.data()?.slots) {
            const slotsData = docSnap.data()?.slots;
            if (Array.isArray(slotsData) && slotsData.every(s => typeof s === 'string')) {
              setAvailableTimesForDay(slotsData.sort());
            } else {
              console.warn(`Available time slots for ${dateKey} are not in expected format:`, slotsData);
              // setAvailableTimesForDay([]); // 이미 위에서 초기화됨
            }
          } else {
            // 문서가 없거나 slots 필드가 없으면 해당 날짜에 예약 가능한 시간이 없는 것
            // setAvailableTimesForDay([]); // 이미 위에서 초기화됨
            // toast({ title: "정보", description: "선택하신 날짜에는 예약 가능한 시간이 없습니다.", variant: "default" }); // 너무 잦은 토스트 방지
          }
        } catch (error) {
          console.error(`Error fetching available times for ${dateKey}: `, error);
          toast({ title: "오류", description: "예약 가능 시간 로딩 중 오류 발생.", variant: "destructive"});
          // setAvailableTimesForDay([]); // 이미 위에서 초기화됨
        } finally {
          setIsLoadingAvailableTimes(false);
        }
      };
      fetchAvailableTimesForSelectedDate();

      // 선택된 날짜의 예약된 시간 (pending 또는 confirmed) 가져오기
      const fetchBookedSlotsForDate = async () => {
        if (!selectedDate) return;
        setLoadingBookedSlots(true);
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        try {
          const bookingsRef = collection(db, 'bookings');
          const q = query(
            bookingsRef,
            where('date', '==', dateStr),
            where('status', 'in', ['pending', 'confirmed'])
          );
          const querySnapshot = await getDocs(q);
          const bookedTimes = querySnapshot.docs.map(doc => doc.data().time as string);
          setBookedSlotsOnSelectedDate(bookedTimes);
        } catch (error) {
          console.error(`Error fetching booked slots for ${dateStr}: `, error);
          toast({ title: "오류", description: "예약 현황 로딩 중 오류 발생.", variant: "destructive" });
          setBookedSlotsOnSelectedDate([]); // 오류 발생 시 비워줌
        } finally {
          setLoadingBookedSlots(false);
        }
      };
      fetchBookedSlotsForDate();

    } else {
      // 날짜가 선택되지 않았거나 auth 로딩 중이면 비워둠
      setAvailableTimesForDay([]);
      setBookedSlotsOnSelectedDate([]); // 날짜 변경 시 booked slots 초기화
    }
  }, [selectedDate, authLoading, user, toast]); // Add user and toast to dependency array

  // Load progress from localStorage on initial mount for NEW bookings only
  useEffect(() => {
    if (!editingBookingId && !authLoading) { // Only for new bookings and after auth check
      const savedProgressString = localStorage.getItem(BOOKING_PROGRESS_STORAGE_KEY);
      if (savedProgressString) {
        try {
          const savedProgress = JSON.parse(savedProgressString);
          if (savedProgress.dateStr) {
            const restoredDate = parseISO(savedProgress.dateStr);
            if (isValidDate(restoredDate)) {
              setSelectedDate(restoredDate);
            }
          }
          if (savedProgress.time) {
            setSelectedTime(savedProgress.time);
          }
          if (savedProgress.userPhone) {
            setUserPhone(savedProgress.userPhone);
          }
          if (savedProgress.step && typeof savedProgress.step === 'number') {
            // Basic validation for step to avoid breaking UI
            if (savedProgress.step >= 1 && savedProgress.step <= 3) { 
              // If date/time are also restored, step can be > 1
              // If only step is restored, it might lead to inconsistent state if date/time are not set
              // For simplicity, only restore step if date is also restored or if step is 1
              if (savedProgress.dateStr || savedProgress.step === 1) {
                 setStep(savedProgress.step);
              }
            }
          }
        } catch (error) {
          console.error("Error parsing booking progress from localStorage:", error);
          localStorage.removeItem(BOOKING_PROGRESS_STORAGE_KEY); // Clear corrupted data
        }
      }
    }
    // Clean up localStorage if user navigates to edit an existing booking later
    if (editingBookingId) {
        localStorage.removeItem(BOOKING_PROGRESS_STORAGE_KEY);
    }
  }, [editingBookingId, authLoading, setSelectedDate, setSelectedTime, setStep]); // Added setters

  // Save progress to localStorage whenever relevant states change for NEW bookings
  useEffect(() => {
    if (!editingBookingId && !authLoading) { // Only for new bookings and after auth check
      const progress = {
        dateStr: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null,
        time: selectedTime,
        userPhone: userPhone,
        step: step,
      };
      // Only save if there is actually some progress (e.g., date selected or step > 1)
      if (progress.dateStr || progress.time || progress.userPhone || progress.step > 1) {
        localStorage.setItem(BOOKING_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
      } else {
        // If all are initial/empty, remove any stale storage item
        localStorage.removeItem(BOOKING_PROGRESS_STORAGE_KEY);
      }
    }
  }, [selectedDate, selectedTime, userPhone, step, editingBookingId, authLoading]);

  // Fetch all dates that have any slots configured (once on mount)
  useEffect(() => {
    if (!authLoading) { // Run after auth check
        const fetchAllConfiguredDates = async () => {
            setIsLoadingAllDatesInfo(true);
            try {
                const q = query(collection(db, AVAILABLE_TIME_SLOTS_COLLECTION_BOOKING));
                const querySnapshot = await getDocs(q);
                const dates: string[] = [];
                querySnapshot.forEach((doc) => {
                    // Assuming doc.id is 'YYYY-MM-DD' and it has a 'slots' array with at least one item
                    if (doc.data()?.slots && Array.isArray(doc.data().slots) && doc.data().slots.length > 0) {
                        dates.push(doc.id);
                    }
                });
                setAllDatesWithSlots(dates.sort());
            } catch (error) {
                console.error("Error fetching all configured dates:", error);
                toast({ title: "오류", description: "예약 가능 날짜 정보 로딩 실패.", variant: "destructive" });
                setAllDatesWithSlots([]);
            } finally {
                setIsLoadingAllDatesInfo(false);
            }
        };
        fetchAllConfiguredDates();
    }
  }, [authLoading, toast]);

  // ======= CONDITIONAL RETURNS (must come AFTER all hook calls) =======
  if (authLoading || (isLoadingInitialData && !authLoading && isAuthenticated) || isLoadingAllDatesInfo) { // Combined loading states
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header /> 
        <div className="flex-grow flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-google-blue animate-spin" />
          <p className="ml-4 text-lg">
            {authLoading ? '인증 상태 확인 중...' : 
             isLoadingAllDatesInfo ? '예약 가능 날짜 정보 로딩 중...' : 
             '예약 정보를 불러오는 중입니다...'}
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !isSubmitting) {
    return <Navigate to="/login" replace />;
  }
  
  // ======= COMPONENT JSX RETURN =======
  const today = new Date(new Date().setHours(0,0,0,0));
  const maxBookableDate = addDays(today, 30);

  const disabledCalendarDates = (date: Date): boolean => {
    if (isLoadingAllDatesInfo) return true; // 모든 날짜 정보 로딩 중에는 전체 비활성화
    const dateString = format(date, 'yyyy-MM-dd');
    const isPastOrTooFar = date < today || date > maxBookableDate;
    const hasNoSlots = !allDatesWithSlots.includes(dateString);
    return isPastOrTooFar || hasNoSlots;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-4xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-google font-bold text-gray-900">
            {pageTitle}
          </h1>
          <Link to={editingBookingId ? "/my-bookings" : "/dashboard"}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {editingBookingId ? "내 예약으로" : "대시보드로"}
            </Button>
          </Link>
        </div>

        <div className="mb-6 px-2 sm:px-0">
          <div className="flex items-start justify-between mb-2">
            {[1, 2, 3, editingBookingId ? 0 : 4].filter(s => s > 0).map((stepNumber, index, arr) => {
              const isCompleted = step > stepNumber;
              const isCurrent = step === stepNumber;
              const isPending = step < stepNumber;

              const iconBgColor = isCompleted ? 'bg-google-green text-white' : isCurrent ? 'bg-google-blue text-white' : 'bg-gray-200 text-gray-600';
              const labelTextColor = isCompleted ? 'text-google-green' : isCurrent ? 'text-google-blue' : 'text-gray-500';
              
              let outgoingLineBgColor = 'bg-gray-200';
              if (isCompleted) {
                outgoingLineBgColor = 'bg-google-green';
              } else if (isCurrent) {
                outgoingLineBgColor = 'bg-google-blue';
              }

              let incomingLineBgColor = 'bg-gray-200';
              if (index > 0) {
                const prevStepNumber = arr[index-1];
                if (step > prevStepNumber) {
                  incomingLineBgColor = 'bg-google-green';
                }
              }

              return (
                <div key={stepNumber} className="flex flex-col items-center flex-1 group">
                  <div className="flex items-center w-full h-10">
                    <div className="flex-1 flex items-center">
                      {index > 0 && (
                        <div className={`h-1 w-full mr-1 sm:mr-1.5 transition-all duration-300 ${
                          isCurrent || isCompleted ? 'bg-google-green' : 'bg-gray-200'
                        }`} />
                      )}
                    </div>

                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 ${iconBgColor}`}>
                      {isCompleted ? <CheckCircle className="w-5 h-5" /> : stepNumber}
                    </div>

                    <div className="flex-1 flex items-center">
                      {index < arr.length - 1 && (
                        <div className={`h-1 w-full ml-1 sm:ml-1.5 transition-all duration-300 ${outgoingLineBgColor}`} />
                      )}
                    </div>
                  </div>

                  <p className={`text-xs mt-1.5 text-center font-medium transition-colors duration-300 w-full truncate px-1 ${labelTextColor} group-hover:text-google-blue`}>
                    {stepLabels[stepNumber - 1]}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col items-center mt-4"> 
          <div className="w-full max-w-2xl space-y-6">
            {step === 1 && (
              <Card className="w-full animate-fade-in shadow-lg">
                <CardHeader className="flex flex-col items-center text-center p-3 sm:p-4"> 
                  <CalendarIcon className="w-7 h-7 mb-1 text-google-blue" />
                  <CardTitle className="text-xl sm:text-2xl">날짜를 선택해주세요</CardTitle>
                  <CardDescription className="text-sm sm:text-base mt-1">
                    예약 가능한 날짜를 선택하세요. (최대 30일 이내)
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center p-3 sm:p-4 pt-0"> 
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    disabled={disabledCalendarDates}
                    className="rounded-md border p-3 mx-auto" 
                    locale={ko}
                    month={currentCalendarViewDate} // Control the displayed month
                    onMonthChange={setCurrentCalendarViewDate} // Update state when month changes
                  />
                </CardContent>
              </Card>
            )}

            {step === 2 && selectedDate && (
              <Card className="w-full animate-fade-in shadow-lg">
                <CardHeader className="flex flex-col items-center text-center p-3 sm:p-4"> 
                  <Clock className="w-7 h-7 mb-1 text-google-green" />
                  <CardTitle className="text-xl sm:text-2xl">시간을 선택해주세요</CardTitle>
                  <CardDescription className="text-sm sm:text-base mt-1">
                    {format(selectedDate, 'PPP (eee)', { locale: ko })}에 가능한 시간을 선택하세요.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center p-3 sm:p-4 pt-1"> 
                  {loadingBookedSlots || isLoadingAvailableTimes ? ( // 로딩 상태 통합, isLoadingBookedSlots -> loadingBookedSlots
                    <div className="flex flex-col items-center justify-center py-8">
                      <Loader2 className="w-8 h-8 text-google-blue animate-spin" />
                      <span className="text-gray-600 mt-2">
                        {isLoadingAvailableTimes ? '예약 가능 시간을 설정 중입니다...' : '예약 현황을 불러오는 중입니다...'}
                      </span>
                    </div>
                  ) : availableTimesForDay.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 w-full max-w-lg">
                      {availableTimesForDay.map((time) => { // adminTimeSlots -> availableTimesForDay
                        const isBooked = isTimeSlotBooked(time);
                        return (
                          <Button
                            key={time}
                            variant={selectedTime === time ? "default" : "outline"}
                            className={`h-12 text-sm sm:text-base relative transition-all duration-200 ${
                              selectedTime === time 
                                ? 'bg-google-green hover:bg-green-700 text-white font-semibold'
                                : 'hover:bg-gray-100'
                            }${isBooked ? ' opacity-50 cursor-not-allowed line-through' : ''}`}
                            disabled={isBooked}
                            onClick={() => !isBooked && handleTimeSelect(time)}
                          >
                            {time}
                            {isBooked && (
                              <Badge variant="destructive" className="text-xs absolute top-1 right-1 px-1.5 py-0.5">
                                마감
                              </Badge>
                            )}
                          </Button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-600">
                      선택하신 날짜에는 예약 가능한 시간이 없습니다. <br/> 다른 날짜를 선택해주세요.
                    </div>
                  )}
                  <div className="mt-6 flex justify-between items-center w-full max-w-lg">
                    <Button variant="outline" onClick={() => setStep(1)} disabled={loadingBookedSlots || isLoadingAvailableTimes}> {/* isLoadingBookedSlots -> loadingBookedSlots */}
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      날짜 다시 선택
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 3 && selectedDate && selectedTime && (
              <Card className="w-full animate-fade-in shadow-lg">
                <CardHeader className="flex flex-col items-center text-center p-3 sm:p-4"> 
                  <CheckCircle className="w-7 h-7 mb-1 text-google-yellow" />
                  <CardTitle className="text-xl sm:text-2xl">예약 내용을 확인해주세요</CardTitle>
                  <CardDescription className="text-sm sm:text-base mt-1">
                    아래 정보로 커피챗을 {editingBookingId ? '수정' : '요청'}합니다.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center space-y-4 p-3 sm:p-4 pt-1">
                  <div className="space-y-4 w-full max-w-md">
                    <div className="space-y-3 p-3 border rounded-lg bg-gray-50 text-left">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">예약자</h3>
                        <p className="text-lg font-semibold text-gray-800">{user?.displayName || '정보 없음'}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">예약 일시</h3>
                        <p className="text-lg font-semibold text-gray-800">
                          {format(selectedDate, 'yyyy년 M월 d일 (eee)', { locale: ko })} {selectedTime}
                        </p>
                      </div>
                      {editingBookingId && originalBookingData?.status && (
                         <div>
                           <h3 className="text-sm font-medium text-gray-500">현재 상태</h3>
                           <p className="text-lg font-semibold">
                              <Badge className={getStatusBadgeStyle(originalBookingData.status) + " text-base px-2.5 py-1"}>
                                  {getStatusText(originalBookingData.status)}
                              </Badge>
                           </p>
                         </div>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <label htmlFor="userPhone" className="text-sm font-medium text-gray-700">
                        전화번호 *
                      </label>
                      <Input
                        id="userPhone"
                        type="tel"
                        value={userPhone}
                        onChange={(e) => setUserPhone(e.target.value)}
                        placeholder="010-1234-5678"
                        required
                      />
                      <p className="text-xs text-gray-500">
                        예약 확정 시 문자로 알림을 보내드립니다.
                      </p>
                    </div>
                  </div>
                  <Alert className="border-google-blue/30 bg-google-blue/5 w-full max-w-md mt-2"> 
                    <CalendarIcon className="h-4 w-4 text-google-blue" />
                    <AlertDescription className="text-google-blue/90 text-sm">
                      {editingBookingId 
                        ? "예약 변경사항을 저장하시겠습니까? 변경 후에는 이전 예약 시간으로 돌아갈 수 없습니다."
                        : "예약 확정 후에는 변경 및 취소가 어려울 수 있습니다. 신중히 확인해주세요."
                      }
                    </AlertDescription>
                  </Alert>
                  <div className="mt-6 flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0 sm:space-x-3 w-full max-w-md">
                    <Button variant="outline" onClick={() => setStep(2)} disabled={isSubmitting} className="w-full sm:w-auto">
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      시간 다시 선택
                    </Button>
                    <Button onClick={handleConfirmBooking} disabled={isSubmitting} className="bg-google-yellow hover:bg-yellow-700 text-white font-semibold w-full sm:w-auto">
                      {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                      {isSubmitting ? (editingBookingId ? '수정 중...' : '예약 처리 중...') : submitButtonText}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 4 && !editingBookingId && (
              <Card className="w-full animate-fade-in shadow-lg">
                <CardHeader className="flex flex-col items-center text-center p-3 sm:p-4"> 
                  <CheckCircle className="w-16 h-16 text-google-green mb-3" />
                  <CardTitle className="text-2xl sm:text-3xl font-semibold">
                    커피챗 예약 요청 완료!
                  </CardTitle>
                  <CardDescription className="text-base mt-1">
                    {selectedDate && selectedTime && 
                      `${format(selectedDate, 'PPP (eee)', { locale: ko })} ${selectedTime}에 예약이 요청되었습니다.`}
                    <br />
                    관리자 확인 후 예약이 확정되며, 확정 시 문자로 알림을 보내드립니다.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center space-y-4 pb-4 px-3 sm:px-4"> 
                  <p className="text-gray-600 text-sm sm:text-base text-center max-w-md"> 
                    예약 내역은 <Link to="/my-bookings" className="text-google-blue hover:underline font-medium">내 예약 관리</Link> 페이지에서 확인할 수 있습니다.
                  </p>
                  <div className="flex flex-col sm:flex-row justify-center space-y-3 sm:space-y-0 sm:space-x-4 w-full max-w-md">
                    <Button onClick={goToDashboard} className="bg-google-blue hover:bg-blue-700 text-white w-full sm:w-auto px-6 py-3">
                      대시보드로 돌아가기
                    </Button>
                    <Button variant="outline" onClick={resetBooking} className="w-full sm:w-auto px-6 py-3">
                      새로운 예약 진행
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-800 border-green-300';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'completed': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
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

export default Booking;
