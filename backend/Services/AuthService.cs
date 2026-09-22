using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BDoc.Domain.Entities;
using BDoc.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace BDoc.Services;

public class AuthService
{
    private readonly EditorDbContext _db;
    private readonly IConfiguration _cfg;
    private readonly IHostEnvironment _env;

    public AuthService(EditorDbContext db, IConfiguration cfg, IHostEnvironment env)
    {
        _db = db;
        _cfg = cfg;
        _env = env;
    }

    public async Task<User?> FindByEmailAsync(string email) =>
        await _db.Users.FirstOrDefaultAsync(u => u.Email == email.ToLowerInvariant());

    public async Task<User?> FindByIdAsync(Guid id) =>
        await _db.Users.FindAsync(id);

    public async Task<User> RegisterAsync(string email, string password)
    {
        email = email.ToLowerInvariant().Trim();
        if (await _db.Users.AnyAsync(u => u.Email == email))
            throw new InvalidOperationException("Email already registered");
        var user = new User
        {
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user;
    }

    public async Task<User?> ValidateAsync(string email, string password)
    {
        var user = await FindByEmailAsync(email.ToLowerInvariant().Trim());
        if (user is null) return null;
        if (!BCrypt.Net.BCrypt.Verify(password, user.PasswordHash)) return null;
        return user;
    }

    public string GenerateToken(User user)
    {
        var key = JwtOptions.ResolveKey(_cfg, _env.IsProduction());
        var issuer = _cfg["Jwt:Issuer"] ?? "BDoc";
        var audience = _cfg["Jwt:Audience"] ?? "BDoc";
        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        var creds = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(ClaimTypes.Email, user.Email),
        };
        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddDays(7),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
