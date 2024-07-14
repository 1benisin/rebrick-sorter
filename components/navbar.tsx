// components/Navbar.tsx

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NavBar = () => {
  const curPath = usePathname();

  const linkClassName = (pathname: string) =>
    `hover:text-gray-300 cursor-pointer ${curPath === pathname ? 'text-blue-500' : ''}`;

  const backgroundColor = process.env.NEXT_PUBLIC_ENVIRONMENT == 'DEV' ? 'bg-yellow-900' : 'bg-slate-400';

  return (
    <nav className={cn(backgroundColor, 'p-4')}>
      <ul className="flex space-x-4">
        <li>
          <Link href="/sorter" passHref>
            <span className={linkClassName('/sorter')}>Sorter</span>
          </Link>
        </li>
        <li>
          <Link href="/settings" passHref>
            <span className={linkClassName('/settings')}>Settings</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
};

export default NavBar;
