import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFirestore } from 'firebase/firestore';
import { doc, getDoc } from 'firebase/firestore';

// See: https://firebase.google.com/docs/web/learn-more#config-object
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_PUBLIC_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

const firebaseApp = initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const storage = getStorage(firebaseApp);
export const db = getFirestore(firebaseApp);

// (async () => {
//   const docRef = doc(firestore, 'bricklink_parts', '3001');
//   const docSnap = await getDoc(docRef);

//   if (docSnap.exists()) {
//     console.log('Document data:', docSnap.data());
//   } else {
//     // doc.data() will be undefined in this case
//     console.log('No such document!');
//   }
// })();

// (async () => {
//   const results = await signInWithEmailAndPassword(
//     firebaseAuth,
//     'benisin@gmail.com',
//     'D@hZoKC5UT0@yFeEoic4'
//   );
//   console.log('LOGIN', results);
// })();
