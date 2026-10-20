import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-4 text-center">
      <h1 className="text-4xl font-bold text-amber-400 mb-2 font-mono">404</h1>
      <p className="text-slate-400 mb-6 text-sm">الصفحة المطلوبة غير موجودة</p>
      <Link
        href="/"
        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold transition-colors"
      >
        العودة للرئيسية
      </Link>
    </div>
  );
}
