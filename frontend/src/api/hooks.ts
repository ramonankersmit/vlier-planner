import { useEffect, useState } from "react";
import { client } from "./client";

export function useWeeks(params: { from: string; to: string }) {
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    client
      .getWeeks(params.from, params.to)
      .then(setData)
      .catch(setError);
  }, [params.from, params.to]);
  return { data, error };
}

export function useAgenda(week: number, year: number) {
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    client
      .getAgenda(week, year)
      .then(setData)
      .catch(setError);
  }, [week, year]);
  return { data, error };
}

export function useMatrix(period: number, year: number) {
  const [data, setData] = useState<any>({});
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    client
      .getMatrix(period, year)
      .then(setData)
      .catch(setError);
  }, [period, year]);
  return { data, error };
}

export function useStudyUnits() {
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    client
      .getStudyUnits()
      .then(setData)
      .catch(setError);
  }, []);
  return { data, error };
}

export function useAssessments(period: number, year: number) {
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    client
      .getAssessments(period, year)
      .then(setData)
      .catch(setError);
  }, [period, year]);
  return { data, error };
}
