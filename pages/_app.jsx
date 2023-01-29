import { useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/globals.css';
import NavigationBar from '../components/NavigationBar';
import { AuthContextProvider } from '../lib/AuthContextProvider';
import { socketInitializer } from '../logic/socketManager';

function MyApp({ Component, pageProps }) {
  // initialize socket connection
  useEffect(() => {
    socketInitializer();
  }, []);

  return (
    <>
      <AuthContextProvider>
        <NavigationBar>
          <Component {...pageProps} />
        </NavigationBar>
      </AuthContextProvider>
    </>
  );
}

export default MyApp;
