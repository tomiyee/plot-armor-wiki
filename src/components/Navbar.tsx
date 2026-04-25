import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="border-b px-6 py-3 flex items-center justify-between">
      <Link href="/" className="text-xl font-bold tracking-tight">
        PlotArmor
      </Link>
      <div className="text-sm text-gray-500">{/* auth placeholder */}</div>
    </nav>
  );
}
