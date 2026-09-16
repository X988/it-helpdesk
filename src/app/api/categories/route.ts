import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
export async function GET(){try{await requireSession();const categories=await db.category.findMany({where:{isActive:true},select:{id:true,name:true},orderBy:{name:"asc"}});return NextResponse.json({categories});}catch{return NextResponse.json({error:"Unauthorized"},{status:401});}}
