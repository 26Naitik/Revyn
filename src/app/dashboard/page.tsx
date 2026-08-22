import { Header } from "@/components/layout/Header";

export default function DashboardPage() {
  return (
    <>
      <Header title="Dashboard" />
      <div className="p-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Revenue at Risk"
            value="₹0"
            description="Across all categories"
            color="red"
          />
          <StatCard
            title="Revenue Recovered"
            value="₹0"
            description="This period"
            color="green"
          />
          <StatCard
            title="Recovery Rate"
            value="0%"
            description="Success rate"
            color="blue"
          />
          <StatCard
            title="Active Recoveries"
            value="0"
            description="In progress"
            color="yellow"
          />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-medium text-gray-900">
              Revenue Over Time
            </h3>
            <p className="mt-4 text-sm text-gray-500">
              Chart will be implemented in a later phase.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-medium text-gray-900">
              Risk by Category
            </h3>
            <p className="mt-4 text-sm text-gray-500">
              Chart will be implemented in a later phase.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-900">
            Recent Activity
          </h3>
          <p className="mt-4 text-sm text-gray-500">
            Activity feed will be implemented in a later phase.
          </p>
        </div>
      </div>
    </>
  );
}

function StatCard({
  title,
  value,
  description,
  color,
}: {
  title: string;
  value: string;
  description: string;
  color: "red" | "green" | "blue" | "yellow";
}) {
  const colorMap = {
    red: "border-l-red-500",
    green: "border-l-green-500",
    blue: "border-l-blue-500",
    yellow: "border-l-yellow-500",
  };

  return (
    <div
      className={`rounded-lg border border-gray-200 border-l-4 bg-white p-6 shadow-sm ${colorMap[color]}`}
    >
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
    </div>
  );
}
