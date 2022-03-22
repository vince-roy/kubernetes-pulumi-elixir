defmodule DemoElixirWeb.Plug.Health do
  @behaviour Plug

  @path_startup   "/_k8s/startup"
  @path_liveness  "/_k8s/liveness"
  @path_readiness "/_k8s/readiness"

  @impl true
  def init(opts), do: opts

  @impl true
  def call(%Plug.Conn{} = conn, _opts) do
    case conn.request_path do
      @path_startup   -> health_response(conn,  has_started?())
      @path_liveness  -> health_response(conn, is_alive?())
      @path_readiness -> health_response(conn,  is_ready?())
      _other          -> conn
    end
  end

  # Respond according to health checks
  defp health_response(conn, true) do
    conn
    |> Plug.Conn.send_resp(200, "OK")
    |> Plug.Conn.halt()
  end

  defp health_response(conn, false) do
    conn
    |> Plug.Conn.send_resp(503, "SERVICE UNAVAILABLE")
    |> Plug.Conn.halt()
  end

  @doc """
  Check if required services are loaded and startup
  tasks completed
  """
  def has_started? do
    is_ready?()
  end

  @doc """
  Check if app is alive should be serving public traffic
  """
  def is_alive? do
    true
  end

  @doc """
  Check if app is ready and working, by making a simple
  request to the DB
  """
  def is_ready? do
    Ecto.Adapters.SQL.query!(DemoElixir.Repo, "SELECT 1") !== nil
  rescue
    _e -> false
  end
end
