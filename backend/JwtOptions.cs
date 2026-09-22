namespace BDoc;

/// <summary>
/// Single source of truth for JWT settings. Fails fast instead of silently
/// running with a missing, weak, or publicly-known signing key.
/// </summary>
public static class JwtOptions
{
    /// <summary>Well-known dev key shipped in appsettings.json. Never valid in Production.</summary>
    public const string DevDefaultKey = "dev-super-secret-key-change-me-32chars!!";

    public static string ResolveKey(IConfiguration config, bool isProduction)
    {
        var key = config["Jwt:Key"];
        if (string.IsNullOrWhiteSpace(key))
            throw new InvalidOperationException(
                "Missing JWT signing key. Set Jwt:Key (env var Jwt__Key, compose JWT_KEY in .env — see .env.example).");
        if (isProduction)
        {
            if (key == DevDefaultKey)
                throw new InvalidOperationException(
                    "Refusing to run in Production with the publicly-known dev JWT key. Set a unique Jwt__Key.");
            if (key.Length < 32)
                throw new InvalidOperationException(
                    "Jwt:Key must be at least 32 characters in Production.");
        }
        return key;
    }
}
