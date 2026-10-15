import {assistantHandler}from "@/presentation/api/assistant-routes";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const POST=assistantHandler("chat");
