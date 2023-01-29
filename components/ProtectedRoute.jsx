import { useRouter } from 'next/router';
import { useAuth } from '../lib/AuthContextProvider';
import { useEffect } from 'react';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const router = useRouter();

  // useEffect(() => {
  //   if (!user.uid && !loading) {
  //     console.log(user, loading);
  //     router.push('/login/');
  //   }
  // }, [router, user, loading]);

  return <div> {user.uid ? children : null} </div>;
};

export default ProtectedRoute;
