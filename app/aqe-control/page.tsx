"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ManagerPage from "../manager/page";

export default function AqeControlPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/manager/access")
      .then(async (response) => {
        if (!response.ok) {
          router.replace("/customer");
          return;
        }
        setChecking(false);
      })
      .catch(() => router.replace("/customer"));
  }, [router]);

  if (checking) {
    return <main className="aqe-control-loading">Securing AQE Control...</main>;
  }

  return <ManagerPage />;
}
