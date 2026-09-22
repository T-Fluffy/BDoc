using Microsoft.Extensions.Configuration;

namespace BDoc.Tests;

public class JwtOptionsTests
{
    private static IConfiguration ConfigWith(string? key)
    {
        var pairs = key is null
            ? new Dictionary<string, string?>()
            : new Dictionary<string, string?> { ["Jwt:Key"] = key };
        return new ConfigurationBuilder().AddInMemoryCollection(pairs).Build();
    }

    [Fact]
    public void MissingKey_Throws()
    {
        Assert.Throws<InvalidOperationException>(() => BDoc.JwtOptions.ResolveKey(ConfigWith(null), isProduction: false));
    }

    [Fact]
    public void DevDefault_RejectedInProduction()
    {
        var ex = Assert.Throws<InvalidOperationException>(() =>
            BDoc.JwtOptions.ResolveKey(ConfigWith(BDoc.JwtOptions.DevDefaultKey), isProduction: true));
        Assert.Contains("dev JWT key", ex.Message);
    }

    [Fact]
    public void DevDefault_AllowedOutsideProduction()
    {
        Assert.Equal(
            BDoc.JwtOptions.DevDefaultKey,
            BDoc.JwtOptions.ResolveKey(ConfigWith(BDoc.JwtOptions.DevDefaultKey), isProduction: false));
    }

    [Fact]
    public void ShortKey_RejectedInProduction()
    {
        Assert.Throws<InvalidOperationException>(() =>
            BDoc.JwtOptions.ResolveKey(ConfigWith("too-short"), isProduction: true));
    }

    [Fact]
    public void CustomKey_AcceptedEverywhere()
    {
        var key = new string('k', 48);
        Assert.Equal(key, BDoc.JwtOptions.ResolveKey(ConfigWith(key), isProduction: true));
        Assert.Equal(key, BDoc.JwtOptions.ResolveKey(ConfigWith(key), isProduction: false));
    }
}
