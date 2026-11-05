import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { farmDoc } from "@/lib/farmDb"; // <--- FONTOS IMPORT

// Permission structure: role -> route -> boolean (allowed/disallowed)
export type RolePermissions = {
    [route: string]: boolean;
};

export type PermissionsMatrix = {
    dolgozó?: RolePermissions;
    főnök?: RolePermissions;
    admin?: RolePermissions; 
};

// A path a farmon belül
const PERMISSIONS_PATH = "settings";
const PERMISSIONS_DOC = "permissions";

export const getPermissions = async (): Promise<PermissionsMatrix> => {
    try {
        // farmDoc használata: farms/{farmId}/settings/permissions
        const docRef = farmDoc(PERMISSIONS_PATH, PERMISSIONS_DOC);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            return snap.data() as PermissionsMatrix;
        }
        return {};
    } catch (error) {
        console.error("Error fetching permissions:", error);
        return {};
    }
};

export const savePermissions = async (permissions: PermissionsMatrix) => {
    try {
        const docRef = farmDoc(PERMISSIONS_PATH, PERMISSIONS_DOC);
        await setDoc(docRef, permissions, { merge: true });
    } catch (error) {
        console.error("Error saving permissions:", error);
        throw error;
    }
};

export const usePermissions = () => {
    const [permissions, setPermissions] = useState<PermissionsMatrix>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let unsubscribe = () => {};

        try {
            // Itt is farmDoc kell a listenerhez!
            // Try-catch blokkba tesszük, mert ha nincs kiválasztott farm (pl. login oldal), a farmDoc hibát dobhat
            const docRef = farmDoc(PERMISSIONS_PATH, PERMISSIONS_DOC);
            unsubscribe = onSnapshot(docRef, (snap) => {
                if (snap.exists()) {
                    setPermissions(snap.data() as PermissionsMatrix);
                } else {
                    setPermissions({});
                }
                setLoading(false);
            }, (error) => {
                console.error("Error subscribing to permissions:", error);
                setLoading(false);
            });
        } catch (e) {
            // Ha nincs farm ID, nem tudunk feliratkozni, de nem is baj (pl. login oldalon vagyunk)
            setLoading(false);
        }

        return () => unsubscribe();
    }, []);

    const isRouteAllowed = (role: string | undefined, route: string): boolean => {
        if (!role) return false;
        if (role === "admin") return true; 

        const rolePerms = permissions[role as keyof PermissionsMatrix];
        if (!rolePerms) return true;

        return rolePerms[route] !== false;
    };

    return { permissions, loading, isRouteAllowed };
};
