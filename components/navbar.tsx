'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NavBar = () => {
  const curPath = usePathname();

  const linkClassName = (pathname: string) =>
    `hover:text-gray-300 cursor-pointer ${curPath === pathname ? 'text-blue-500' : ''}`;

  return (
    <nav className="bg-gray-800 text-white p-4">
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
