using BDoc.Services;
using Microsoft.AspNetCore.Mvc;

namespace BDoc.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AuthService _auth;

    public AuthController(AuthService auth) => _auth = auth;

    public record RegisterRequest(string Email, string Password);
    public record LoginRequest(string Email, string Password);
    public record AuthResponse(string Token, string Email, Guid UserId);

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest("Email and password required");
        if (req.Password.Length < 6)
            return BadRequest("Password must be at least 6 characters");
        try
        {
            var user = await _auth.RegisterAsync(req.Email, req.Password);
            var token = _auth.GenerateToken(user);
            return Ok(new AuthResponse(token, user.Email, user.Id));
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(ex.Message);
        }
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest("Email and password required");
        var user = await _auth.ValidateAsync(req.Email, req.Password);
        if (user is null) return Unauthorized("Invalid credentials");
        var token = _auth.GenerateToken(user);
        return Ok(new AuthResponse(token, user.Email, user.Id));
    }

    [HttpGet("me")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public async Task<IActionResult> Me()
    {
        var email = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value
            ?? User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Email)?.Value;
        return Ok(new { email });
    }
}
