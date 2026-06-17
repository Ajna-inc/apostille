'use client'

import { useEffect } from "react";
import OID4VCDemo from "../_components/OID4VCDemo";
import { useTheme } from "@/app/components/ThemeProvider";

export default function Page() {
    const { theme, setTheme } = useTheme();

    useEffect(() => {
        const previous = theme;
        setTheme('light');
        return () => {
            setTheme(previous);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <OID4VCDemo />
}
