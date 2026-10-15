'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EmployeeForm } from '../../../../components/employee-form';
import { Failure, Loading, Skeleton } from '../../../../components/ui/state';
import { api } from '../../../../lib/api';
import type { EmployeeListItem, ReferenceData } from '../../../../lib/api-types';
import { useApi } from '../../../../lib/use-api';

export default function NewEmployeePage() {
  const router = useRouter();
  const reference = useApi<ReferenceData>('/reference');

  return (
    <section className="space-y-6">
      <div>
        <Link href="/employees" className="text-sm text-muted-foreground underline">
          Employees
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Add an employee</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The record starts here; the first salary is a change recorded on their page.
        </p>
      </div>

      {reference.state === 'loading' && (
        // The form's own grid, so the fields do not jump into place under the heading.
        <Loading label="The form" className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 11 }, (_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </Loading>
      )}

      {reference.state === 'error' && <Failure>{reference.message}</Failure>}

      {reference.state === 'ready' && (
        <EmployeeForm
          reference={reference.data}
          submitLabel="Add the employee"
          onCancel={() => {
            router.push('/employees');
          }}
          onSubmit={async (body) => {
            const written = await api<EmployeeListItem>('/employees', {
              method: 'POST',
              body: JSON.stringify(body),
            });
            router.push(`/employees/${String(written.id)}`);
          }}
        />
      )}
    </section>
  );
}
